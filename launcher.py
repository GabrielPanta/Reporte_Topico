import os
import sys
import webbrowser
import socket
import threading
import time
import json
import datetime
import decimal
import urllib.parse
from http.server import SimpleHTTPRequestHandler, HTTPServer

# Configuración de Base de Datos por defecto (SQL Server)
SQL_CONFIG = {
    'driver': '{SQL Server}',
    'server': 'vfstbd01',
    'database': 'bsis_rem_afr',
    'uid': 'gpanta',
    'pwd': 'Pantagabriel#98',
    'wsid': 'VFRPTS03'
}

def get_connection_string():
    return (
        f"DRIVER={SQL_CONFIG['driver']};"
        f"SERVER={SQL_CONFIG['server']};"
        f"DATABASE={SQL_CONFIG['database']};"
        f"UID={SQL_CONFIG['uid']};"
        f"PWD={SQL_CONFIG['pwd']};"
        f"WSID={SQL_CONFIG.get('wsid', '')};"
    )

def get_resource_path(relative_path):
    """Obtiene la ruta absoluta del recurso, ya sea en desarrollo o empaquetado."""
    if hasattr(sys, '_MEIPASS'):
        return os.path.join(sys._MEIPASS, relative_path)
    return os.path.join(os.path.abspath(os.path.dirname(__file__)), relative_path)

def json_serial(obj):
    """Serializador para objetos no estándar en JSON (fechas, decimales)."""
    if isinstance(obj, (datetime.datetime, datetime.date)):
        return obj.isoformat()
    if isinstance(obj, datetime.time):
        return obj.strftime('%H:%M:%S')
    if isinstance(obj, decimal.Decimal):
        return float(obj)
    if isinstance(obj, bytes):
        return obj.decode('utf-8', errors='replace')
    return str(obj)

class CustomHTTPHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        directory = get_resource_path('')
        super().__init__(*args, directory=directory, **kwargs)

    def log_message(self, format, *args):
        # Silenciar logs regulares en consola
        pass

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        if path == '/api/trabajadores':
            self.handle_api_trabajadores(parsed_url.query)
        elif path == '/api/ultimo-dia':
            self.handle_api_ultimo_dia(parsed_url.query)
        elif path == '/api/marcaciones':
            self.handle_api_marcaciones(parsed_url.query)
        elif path == '/api/buses':
            self.handle_api_buses(parsed_url.query)
        elif path == '/api/cuadrillas':
            self.handle_api_cuadrillas(parsed_url.query)
        elif path == '/api/test-sql':
            self.handle_api_test_sql()
        else:
            super().do_GET()

    def handle_api_test_sql(self):
        try:
            import pyodbc
            conn_str = get_connection_string()
            conn = pyodbc.connect(conn_str, timeout=5)
            conn.close()
            self.send_json_response(200, {
                'success': True,
                'message': f"Conexión exitosa al servidor {SQL_CONFIG['server']} ({SQL_CONFIG['database']})"
            })
        except Exception as e:
            self.send_json_response(500, {
                'success': False,
                'error': str(e)
            })

    def handle_api_trabajadores(self, query_str):
        """Consulta: SPC_FICHA_TRABAJADOR_SIN_DATOSSUELDOS"""
        try:
            import pyodbc
        except ImportError:
            self.send_json_response(500, {'success': False, 'error': 'pyodbc no está instalado.'})
            return

        now = datetime.datetime.now()
        default_month = now.month
        default_year = now.year

        if default_month == 12:
            last_day = 31
        else:
            next_month = datetime.date(default_year, default_month + 1, 1)
            last_day = (next_month - datetime.timedelta(days=1)).day

        default_fechaini = f"{last_day}/{default_month}/{default_year}"
        default_zonas = (
            '0,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,155,0'
        )

        params = urllib.parse.parse_qs(query_str)
        id_empresa = int(params.get('idEmpresa', [14])[0])
        activo = int(params.get('activo', [1])[0])
        mes = int(params.get('mes', [default_month])[0])
        anio = int(params.get('anio', [default_year])[0])
        zona = params.get('zona', [default_zonas])[0]
        fechaini = params.get('fechaini', [default_fechaini])[0]

        try:
            conn = pyodbc.connect(get_connection_string(), timeout=12)
            cursor = conn.cursor()
            sql = """
            EXEC SPC_FICHA_TRABAJADOR_SIN_DATOSSUELDOS 
                @IdEmpresa = ?, 
                @activo = ?, 
                @mes = ?, 
                @año = ?, 
                @Zona = ?, 
                @fechaini = ?
            """
            cursor.execute(sql, (id_empresa, activo, mes, anio, zona, fechaini))

            if not cursor.description:
                self.send_json_response(200, {'success': True, 'count': 0, 'headers': [], 'data': []})
                conn.close()
                return

            columns = [col[0] for col in cursor.description]
            raw_rows = cursor.fetchall()
            conn.close()

            raw_data = self._rows_to_dicts(columns, raw_rows)
            
            # Deduplicar y filtrar solo trabajadores ACTIVOS y NO FINIQUITADOS
            seen_ruts = set()
            data = []
            for item in raw_data:
                rut = str(item.get('RutTrabajador', '')).strip()
                if not rut or rut in seen_ruts:
                    continue

                # Filtrar finiquitados o no vigentes
                fec_fin = item.get('FechaFiniquito')
                causal_fin = item.get('Causal En Finiquito')
                vig = str(item.get('Vigencia', '')).strip().lower()
                vig_uc = str(item.get('Vigencia Ultimo Contrato', '')).strip().lower()
                nro_fin = item.get('Nro de Finiquitados')

                is_finiquitado = bool(
                    (fec_fin and str(fec_fin).strip() and str(fec_fin).strip() != 'None') or
                    (causal_fin and str(causal_fin).strip() and str(causal_fin).strip() != 'None') or
                    vig == 'no' or
                    vig_uc == 'no' or
                    (nro_fin and str(nro_fin).strip() not in ('0', '', 'None'))
                )

                if is_finiquitado:
                    continue

                seen_ruts.add(rut)
                data.append(item)

            self.send_json_response(200, {
                'success': True,
                'count': len(data),
                'headers': columns,
                'data': data,
                'source': f"SQL Server ({SQL_CONFIG['server']}/{SQL_CONFIG['database']})",
                'params': {'idEmpresa': id_empresa, 'activo': activo, 'mes': mes, 'anio': anio, 'fechaini': fechaini}
            })
        except Exception as e:
            self.send_json_response(500, {'success': False, 'error': f"Error en SPC_FICHA_TRABAJADOR_SIN_DATOSSUELDOS: {str(e)}"})

    def handle_api_ultimo_dia(self, query_str):
        """Consulta: SPC_BUSCA_ULTIMO_DIA_ACTIVIDAD_TRABAJADOR"""
        try:
            import pyodbc
        except ImportError:
            self.send_json_response(500, {'success': False, 'error': 'pyodbc no está instalado.'})
            return

        now = datetime.datetime.now()
        params = urllib.parse.parse_qs(query_str)
        id_empresa = int(params.get('idEmpresa', [14])[0])
        mes = int(params.get('mes', [now.month])[0])
        anio = int(params.get('anio', [now.year])[0])

        try:
            conn = pyodbc.connect(get_connection_string(), timeout=15)
            cursor = conn.cursor()
            sql = "EXEC SPC_BUSCA_ULTIMO_DIA_ACTIVIDAD_TRABAJADOR @IDEMPRESA = ?, @MES = ?, @ANO = ?"
            cursor.execute(sql, (id_empresa, mes, anio))

            if not cursor.description:
                self.send_json_response(200, {'success': True, 'count': 0, 'headers': [], 'data': []})
                conn.close()
                return

            columns = [col[0] for col in cursor.description]
            raw_rows = cursor.fetchall()
            conn.close()

            raw_data = self._rows_to_dicts(columns, raw_rows)
            
            # Deduplicar por RUT/DNI manteniendo el registro más completo
            seen_ruts_ud = set()
            data = []
            for item in raw_data:
                rut = str(item.get('RUT/DNI', item.get('IDTRABAJADOR', ''))).strip()
                if rut:
                    if rut in seen_ruts_ud:
                        continue
                    seen_ruts_ud.add(rut)
                data.append(item)

            self.send_json_response(200, {
                'success': True,
                'count': len(data),
                'headers': columns,
                'data': data,
                'source': f"SQL Server ({SQL_CONFIG['server']}/{SQL_CONFIG['database']})",
                'params': {'idEmpresa': id_empresa, 'mes': mes, 'anio': anio}
            })
        except Exception as e:
            self.send_json_response(500, {'success': False, 'error': f"Error en SPC_BUSCA_ULTIMO_DIA_ACTIVIDAD_TRABAJADOR: {str(e)}"})

    def handle_api_marcaciones(self, query_str):
        """Consulta: SPC_LOGIN_MARCACIONES (soporta 1 día o rango de 3 días)"""
        try:
            import pyodbc
        except ImportError:
            self.send_json_response(500, {'success': False, 'error': 'pyodbc no está instalado.'})
            return

        params = urllib.parse.parse_qs(query_str)
        fecha = params.get('fecha', ['19/8/2026'])[0]
        fecha_hasta = params.get('fechaHasta', [None])[0]
        sw_contrato = int(params.get('sw_contrato', [0])[0])
        id_empresa = int(params.get('idEmpresa', [14])[0]) if params.get('idEmpresa') else 14
        dias = int(params.get('dias', [3])[0]) # Por defecto 3 días como condición

        try:
            conn = pyodbc.connect(get_connection_string(), timeout=45)
            cursor = conn.cursor()

            if fecha_hasta:
                sql = "EXEC SPC_LOGIN_MARCACIONES @Fecha = ?, @FechaHasta = ?, @sw_contrato = ?, @IdEmpresa = ?"
                cursor.execute(sql, (fecha, fecha_hasta, sw_contrato, id_empresa))
            elif dias > 1:
                try:
                    parts = [int(p) for p in fecha.split('/')]
                    end_dt = datetime.date(parts[2], parts[1], parts[0])
                    start_dt = end_dt - datetime.timedelta(days=dias - 1)
                    start_str = f"{start_dt.day}/{start_dt.month}/{start_dt.year}"
                    sql = "EXEC SPC_LOGIN_MARCACIONES @Fecha = ?, @FechaHasta = ?, @sw_contrato = ?, @IdEmpresa = ?"
                    cursor.execute(sql, (start_str, fecha, sw_contrato, id_empresa))
                except Exception:
                    sql = "EXEC SPC_LOGIN_MARCACIONES @Fecha = ?, @sw_contrato = ?, @IdEmpresa = ?"
                    cursor.execute(sql, (fecha, sw_contrato, id_empresa))
            else:
                sql = "EXEC SPC_LOGIN_MARCACIONES @Fecha = ?, @sw_contrato = ?, @IdEmpresa = ?"
                cursor.execute(sql, (fecha, sw_contrato, id_empresa))

            if not cursor.description:
                self.send_json_response(200, {'success': True, 'count': 0, 'headers': [], 'data': []})
                conn.close()
                return

            columns = [col[0] for col in cursor.description]
            raw_rows = cursor.fetchall()
            conn.close()

            data = self._rows_to_dicts(columns, raw_rows)
            self.send_json_response(200, {
                'success': True,
                'count': len(data),
                'headers': columns,
                'data': data,
                'source': f"SQL Server ({SQL_CONFIG['server']}/{SQL_CONFIG['database']})",
                'params': {'fecha': fecha, 'fechaHasta': fecha_hasta, 'sw_contrato': sw_contrato, 'idEmpresa': id_empresa, 'dias': dias}
            })
        except Exception as e:
            self.send_json_response(500, {'success': False, 'error': f"Error en SPC_LOGIN_MARCACIONES: {str(e)}"})

    def handle_api_buses(self, query_str):
        """Consulta: SPC_BUSES"""
        try:
            import pyodbc
        except ImportError:
            self.send_json_response(500, {'success': False, 'error': 'pyodbc no está instalado.'})
            return

        params = urllib.parse.parse_qs(query_str)
        id_empresa = int(params.get('idEmpresa', [14])[0])

        try:
            conn = pyodbc.connect(get_connection_string(), timeout=10)
            cursor = conn.cursor()
            sql = "EXEC SPC_BUSES @IDEMPRESA = ?"
            cursor.execute(sql, (id_empresa,))

            if not cursor.description:
                self.send_json_response(200, {'success': True, 'count': 0, 'headers': [], 'data': []})
                conn.close()
                return

            columns = [col[0] for col in cursor.description]
            raw_rows = cursor.fetchall()
            conn.close()

            data = self._rows_to_dicts(columns, raw_rows)
            self.send_json_response(200, {
                'success': True,
                'count': len(data),
                'headers': columns,
                'data': data,
                'source': f"SQL Server ({SQL_CONFIG['server']}/{SQL_CONFIG['database']})"
            })
        except Exception as e:
            self.send_json_response(500, {'success': False, 'error': f"Error en SPC_BUSES: {str(e)}"})

    def handle_api_cuadrillas(self, query_str):
        """Consulta: SPC_DINAMICA_CUADRILLAS"""
        try:
            import pyodbc
        except ImportError:
            self.send_json_response(500, {'success': False, 'error': 'pyodbc no está instalado.'})
            return

        params = urllib.parse.parse_qs(query_str)
        id_empresa = int(params.get('idEmpresa', [14])[0])

        try:
            conn = pyodbc.connect(get_connection_string(), timeout=10)
            cursor = conn.cursor()
            sql = "EXEC SPC_DINAMICA_CUADRILLAS @EMPRESA = ?"
            cursor.execute(sql, (id_empresa,))

            if not cursor.description:
                self.send_json_response(200, {'success': True, 'count': 0, 'headers': [], 'data': []})
                conn.close()
                return

            columns = [col[0] for col in cursor.description]
            raw_rows = cursor.fetchall()
            conn.close()

            data = self._rows_to_dicts(columns, raw_rows)
            self.send_json_response(200, {
                'success': True,
                'count': len(data),
                'headers': columns,
                'data': data,
                'source': f"SQL Server ({SQL_CONFIG['server']}/{SQL_CONFIG['database']})"
            })
        except Exception as e:
            self.send_json_response(500, {'success': False, 'error': f"Error en SPC_DINAMICA_CUADRILLAS: {str(e)}"})

    def _rows_to_dicts(self, columns, raw_rows):
        data = []
        for row in raw_rows:
            obj = {}
            for idx, col_name in enumerate(columns):
                val = row[idx]
                col_lower = col_name.lower()
                if val is None:
                    obj[col_name] = ''
                elif isinstance(val, datetime.datetime):
                    if val.year <= 1900 or 'hora' in col_lower or 'turno' in col_lower:
                        obj[col_name] = val.strftime('%H:%M')
                    elif val.hour != 0 or val.minute != 0 or val.second != 0:
                        obj[col_name] = val.strftime('%Y-%m-%d %H:%M:%S')
                    else:
                        obj[col_name] = val.strftime('%Y-%m-%d')
                elif isinstance(val, datetime.date):
                    obj[col_name] = val.strftime('%Y-%m-%d')
                elif isinstance(val, datetime.time):
                    obj[col_name] = val.strftime('%H:%M')
                elif isinstance(val, decimal.Decimal):
                    obj[col_name] = float(val)
                else:
                    obj[col_name] = val
            data.append(obj)
        return data

    def send_json_response(self, status_code, data_dict):
        json_bytes = json.dumps(data_dict, default=json_serial, ensure_ascii=False).encode('utf-8')
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(json_bytes)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json_bytes)

def find_free_port(start_port=5500):
    """Encuentra un puerto libre para iniciar el servidor."""
    port = start_port
    while port < 6000:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(('127.0.0.1', port)) != 0:
                return port
        port += 1
    return 5500

def main():
    if sys.platform == 'win32' and hasattr(sys.stdout, 'reconfigure'):
        try:
            sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        except Exception:
            pass

    print("=" * 65)
    print("  CONSOLIDADOR DE PERSONAL, LABORES Y MARCACIONES (RRHH PRO)")
    print("  Conector SQL Server Activo (vfstbd01): 5 Fuentes Disponibles")
    print("=" * 65)
    print("\nIniciando servidor local seguro...")

    port = find_free_port()
    server_address = ('127.0.0.1', port)
    httpd = HTTPServer(server_address, CustomHTTPHandler)

    url = f"http://127.0.0.1:{port}/index.html"
    print(f"\n[OK] Servidor activo en: {url}")
    print("[OK] Endpoints SQL Server listos:")
    print("     - /api/trabajadores (SPC_FICHA_TRABAJADOR_SIN_DATOSSUELDOS)")
    print("     - /api/ultimo-dia   (SPC_BUSCA_ULTIMO_DIA_ACTIVIDAD_TRABAJADOR)")
    print("     - /api/marcaciones  (SPC_LOGIN_MARCACIONES - 1 o 3 días)")
    print("     - /api/buses        (SPC_BUSES)")
    print("     - /api/cuadrillas   (SPC_DINAMICA_CUADRILLAS)")
    print("[OK] Abriendo la aplicación en tu navegador...")
    print("\n-----------------------------------------------------------------")
    print("  Para usar el programa: interactúa normalmente en el navegador.")
    print("  Para cerrar el programa: cierra esta ventana o presiona Ctrl + C.")
    print("-----------------------------------------------------------------\n")

    def open_browser():
        time.sleep(0.6)
        webbrowser.open(url)

    threading.Thread(target=open_browser, daemon=True).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nCerrando servidor...")
        httpd.server_close()
        sys.exit(0)

if __name__ == '__main__':
    main()
