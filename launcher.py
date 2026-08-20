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
            
            # Catálogo de Empresas
            EMPRESAS_MAP = {
                1: 'SOCIEDAD AGRICOLA EL PORVENIR S.A.',
                2: 'EL DURAZNO',
                3: 'LOS PARRONES',
                4: 'QUILAMUTA',
                5: 'INVERSIONES RVD LIMITADA',
                7: 'AGRICOLA PILARES VERDES SPA',
                8: 'SOC. EXPORTADORA VERFRUT SPA',
                9: 'SOCIEDAD AGRÍCOLA RAPEL S. A. C.',
                11: 'INMOBILIARIA FARALEUFU LIMITADA',
                12: 'ALGARROBOS PIURA SAC',
                14: 'SOCIEDAD EXPORTADORA VERFRUT S. A. C.',
                16: 'AGRICOLA PJM LIMITADA',
                17: 'AGRICOLA VERCELING CHILE LIMITADA',
                19: 'AGRICOLA EL PEÑASCO SPA',
                20: 'SKY WINGS SPA',
                21: 'AGRICOLA EL REMANSO LTDA',
                22: 'BODEGAS LOS LIRIOS SPA',
                23: 'AGRICOLA AVANTI S.A.C.',
                31: 'BOMAREA S.R.L',
                32: 'INVERSIONES MOSQUETA S.A.C.',
                33: 'INVERSIONES PIRONA S.A.C.',
                34: 'INVERSIONES LEFKADA S.A.C.',
                35: 'INVERSIONES HEFEI S.A.C.'
            }

            if 'Empresa' not in columns:
                columns.insert(0, 'Empresa')

            # Deduplicar y filtrar solo trabajadores ACTIVOS y NO FINIQUITADOS
            seen_ruts = set()
            data = []
            for item in raw_data:
                rut = str(item.get('RutTrabajador', '')).strip()
                if not rut or rut in seen_ruts:
                    continue

                # Asignar Empresa
                raw_id_emp = item.get('IdEmpresa')
                try:
                    id_emp_num = int(raw_id_emp) if raw_id_emp is not None else int(id_empresa)
                except (ValueError, TypeError):
                    id_emp_num = 14
                item['Empresa'] = EMPRESAS_MAP.get(id_emp_num, f'EMPRESA {id_emp_num}')

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

            # Catálogo de Zonas y Fundos
            ZONAS_MAP = {
                '1': 'VIÑA LA GRUTA', '2': 'PLANTA VERFRUT RAPEL', '3': 'FUNDO MOLINA',
                '4': 'FUNDO EL DURAZNO', '5': 'FUNDO EL PORVENIR', '6': 'LA CEBADA',
                '7': 'FUNDO TUNCAHUE', '8': 'FUNDO QUILAMUTA', '9': 'NUEVA ESPERANZA',
                '10': 'FUNDO LA CABAÑA', '11': 'LIMONES (OBREROS)', '12': 'FUNDO LONCHA',
                '13': 'ADMINISTRACION GENERAL', '14': 'MAQUINARIA PESADA', '15': 'PERSONAL RVD',
                '16': 'FUNDO SAN VICENTE', '17': 'FUNDO SAN JOSÉ', '18': 'FUNDO SANTA ROSA',
                '40': 'SANTA ROSA 2', '41': 'PLANTA VERFRUT ARANDANOS', '49': 'OPERACIONES CAMPO',
                '50': 'OLIVARES BAJO', '53': 'LOS VIEJITOS', '54': 'SANTA ROSA',
                '55': 'ADMINISTRACION VERFRUT PERU', '58': 'PUNTA ARENAS', '60': 'OLIVARES BAJO (OBREROS)',
                '64': 'SANTA ROSA (OBREROS)', '68': 'PUNTA ARENAS (OBREROS)', '70': 'SAN VICENTE',
                '80': 'CAMPOS EXTERNOS', '81': 'EXPORTADORA', '180': 'CAMPOS EXTERNOS',
                '280': 'CAMPOS EXTERNOS', '755': 'ADMINISTRACION VERFRUT PERU', '781': 'EXPORTADORA',
                '790': 'TERCEROS', '821': 'LIMONES', '840': 'SANTA ROSA 2',
                '841': 'PLANTA VERFRUT ARANDANOS', '848': 'SAN RAFAEL', '849': 'OPERACIONES CAMPO',
                '850': 'OLIVARES BAJO', '851': 'FUNDO EL PAPAYO', '852': 'LOS OLIVARES',
                '853': 'LOS VIEJITOS', '854': 'SANTA ROSA', '855': 'ADMINISTRACION VERFRUT PERU',
                '856': 'SAN VICENTE', '858': 'PUNTA ARENAS', '870': 'ALGARROBOS',
                '880': 'CAMPOS EXTERNOS', '881': 'EXPORTADORA'
            }

            data = []
            for item in raw_data:
                # Formatear ZONA (ej. 54 -> "54 SANTA ROSA")
                if 'ZONA' in item and item['ZONA'] is not None:
                    raw_z = str(item['ZONA']).strip()
                    if raw_z in ZONAS_MAP and not raw_z.endswith(ZONAS_MAP[raw_z]):
                        item['ZONA'] = f"{raw_z} {ZONAS_MAP[raw_z]}"

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
        fecha = params.get('fecha', [None])[0]
        fecha_desde = params.get('fechaDesde', [None])[0] or params.get('desde', [None])[0]
        fecha_hasta = params.get('fechaHasta', [None])[0] or params.get('hasta', [None])[0]
        sw_contrato = int(params.get('sw_contrato', [0])[0])
        id_empresa = int(params.get('idEmpresa', [14])[0]) if params.get('idEmpresa') else 14
        dias = int(params.get('dias', [3])[0])

        # Calcular rango de 3 fechas desde la fecha base hacia atrás
        now = datetime.datetime.now()
        if not fecha_hasta:
            if fecha:
                fecha_hasta = fecha
            else:
                fecha_hasta = f"{now.day:02d}/{now.month:02d}/{now.year}"

        if not fecha_desde:
            try:
                parts = [int(p) for p in fecha_hasta.split('/')]
                end_dt = datetime.date(parts[2], parts[1], parts[0])
                start_dt = end_dt - datetime.timedelta(days=dias - 1)
                fecha_desde = f"{start_dt.day:02d}/{start_dt.month:02d}/{start_dt.year}"
                fecha_hasta = f"{end_dt.day:02d}/{end_dt.month:02d}/{end_dt.year}"
            except Exception:
                fecha_desde = '18/08/2026'
                fecha_hasta = '20/08/2026'

        try:
            conn = pyodbc.connect(get_connection_string(), timeout=60)
            cursor = conn.cursor()

            sql = "EXEC SPC_LOGIN_MARCACIONES @Fecha = ?, @FechaHasta = ?, @sw_contrato = 0, @IdEmpresa = ?"
            cursor.execute(sql, (fecha_desde, fecha_hasta, id_empresa))

            while cursor.description is None:
                if not cursor.nextset():
                    break

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
                'params': {'fechaDesde': fecha_desde, 'fechaHasta': fecha_hasta, 'sw_contrato': sw_contrato, 'idEmpresa': id_empresa, 'dias': dias}
            })
        except Exception as e:
            self.send_json_response(500, {'success': False, 'error': f"Error en SPC_LOGIN_MARCACIONES: {str(e)}"})

    def handle_api_buses(self, query_str):
        """Consulta: SPC_REGISTRO_RUTA (Buses y Rutas)"""
        try:
            import pyodbc
        except ImportError:
            self.send_json_response(500, {'success': False, 'error': 'pyodbc no está instalado.'})
            return

        params = urllib.parse.parse_qs(query_str)
        cod_pais = params.get('codPais', ['PE'])[0] or params.get('cod_pais', ['PE'])[0]
        desde = params.get('desde', ['16/08/2026'])[0]
        hasta = params.get('hasta', ['31/08/2026'])[0]
        id_empresa = int(params.get('idEmpresa', [0])[0]) if params.get('idEmpresa') and params.get('idEmpresa')[0] != '0' else None

        try:
            conn = pyodbc.connect(get_connection_string(), timeout=35)
            cursor = conn.cursor()
            
            # Ejecutar SPC_REGISTRO_RUTA
            if id_empresa:
                sql = "EXEC SPC_REGISTRO_RUTA @COD_PAIS = ?, @DESDE = ?, @HASTA = ?, @IDEMPRESA = ?"
                cursor.execute(sql, (cod_pais, desde, hasta, id_empresa))
            else:
                sql = "EXEC SPC_REGISTRO_RUTA @COD_PAIS = ?, @DESDE = ?, @HASTA = ?"
                cursor.execute(sql, (cod_pais, desde, hasta))

            while cursor.description is None:
                if not cursor.nextset():
                    break

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
                'source': f"SQL Server ({SQL_CONFIG['server']}/{SQL_CONFIG['database']}) - SPC_REGISTRO_RUTA",
                'params': {'codPais': cod_pais, 'desde': desde, 'hasta': hasta, 'idEmpresa': id_empresa}
            })
        except Exception as e:
            # Fallback a SPC_BUSES si falla
            try:
                conn = pyodbc.connect(get_connection_string(), timeout=10)
                cursor = conn.cursor()
                cursor.execute("EXEC SPC_BUSES @IDEMPRESA = 14")
                if cursor.description:
                    columns = [col[0] for col in cursor.description]
                    raw_rows = cursor.fetchall()
                    conn.close()
                    data = self._rows_to_dicts(columns, raw_rows)
                    self.send_json_response(200, {'success': True, 'count': len(data), 'headers': columns, 'data': data, 'source': 'SPC_BUSES (Fallback)'})
                    return
            except Exception:
                pass
            self.send_json_response(500, {'success': False, 'error': f"Error en SPC_REGISTRO_RUTA: {str(e)}"})

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
