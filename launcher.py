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
        elif path == '/api/cuarteles':
            self.handle_api_cuarteles(parsed_url.query)
        elif path == '/api/zonas':
            self.handle_api_zonas(parsed_url.query)
        elif path == '/api/test-sql':
            self.handle_api_test_sql()
        else:
            super().do_GET()

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        if path == '/api/save-excel':
            self.handle_api_save_excel()
        elif path == '/api/open-file':
            self.handle_api_open_file()
        else:
            self.send_json_response(404, {'success': False, 'error': 'Endpoint no encontrado'})

    def handle_api_save_excel(self):
        try:
            import base64
            content_length = int(self.headers.get('Content-Length', 0))
            post_body = self.rfile.read(content_length)
            payload = json.loads(post_body.decode('utf-8'))

            filename = payload.get('filename') or f"Consolidado_Trabajadores_{datetime.date.today().isoformat()}.xlsx"
            base64_data = payload.get('base64', '')

            # Guardar en la carpeta Descargas del usuario de Windows
            downloads_dir = os.path.join(os.path.expanduser('~'), 'Downloads')
            os.makedirs(downloads_dir, exist_ok=True)
            file_path = os.path.join(downloads_dir, filename)

            # Escribir archivo binario
            file_bytes = base64.b64decode(base64_data)
            with open(file_path, 'wb') as f:
                f.write(file_bytes)

            self.send_json_response(200, {
                'success': True,
                'path': file_path,
                'filename': filename,
                'size': len(file_bytes),
                'message': f"Archivo guardado exitosamente en: {file_path}"
            })
        except Exception as e:
            self.send_json_response(500, {
                'success': False,
                'error': f"Error al guardar archivo Excel: {str(e)}"
            })

    def handle_api_open_file(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            post_body = self.rfile.read(content_length)
            payload = json.loads(post_body.decode('utf-8'))
            file_path = payload.get('path', '')
            if file_path and os.path.exists(file_path):
                os.startfile(file_path)
                self.send_json_response(200, {'success': True, 'message': 'Archivo abierto'})
            else:
                self.send_json_response(404, {'success': False, 'error': 'Archivo no encontrado'})
        except Exception as e:
            self.send_json_response(500, {'success': False, 'error': str(e)})

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
        fechaini = params.get('fechaini', [default_fechaini])[0]

        try:
            conn = pyodbc.connect(get_connection_string(), timeout=40)
            cursor = conn.cursor()

            # Consultar dinámicamente el catálogo de Zonas para la empresa activa desde la tabla [Zona]
            zonas_emp_map = {}
            try:
                cursor.execute("SELECT IdZona, Nombre FROM [Zona] WHERE IdEmpresa = ?", (id_empresa,))
                for zr in cursor.fetchall():
                    zid = str(zr[0]).strip()
                    znom = str(zr[1]).strip()
                    import re
                    clean_z = re.sub(r'\s*\(\s*(?:JOR\s*)?[\d\.]+\s*\)', '', znom, flags=re.IGNORECASE).strip()
                    zonas_emp_map[zid] = clean_z or znom
            except Exception as ze:
                print(f"Warning: No se pudo consultar tabla [Zona]: {ze}")

            # Construir la lista completa de IDs de zona para consultar
            all_known_zids = set(zonas_emp_map.keys())
            for extra_id in range(0, 100):
                all_known_zids.add(str(extra_id))
            for special_id in [121, 149, 153, 155, 156, 180, 181, 190, 241, 249, 253, 255, 280, 290, 755, 781, 790, 821, 840, 841, 848, 849, 850, 851, 852, 853, 854, 855, 856, 858, 870, 880, 881, 953]:
                all_known_zids.add(str(special_id))

            zona_param = params.get('zona', [','.join(sorted(all_known_zids, key=lambda x: int(x) if x.isdigit() else 9999))])[0]

            sql = """
            EXEC SPC_FICHA_TRABAJADOR_SIN_DATOSSUELDOS 
                @IdEmpresa = ?, 
                @activo = ?, 
                @mes = ?, 
                @año = ?, 
                @Zona = ?, 
                @fechaini = ?
            """
            cursor.execute(sql, (id_empresa, activo, mes, anio, zona_param, fechaini))

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

                # Formatear Zona Labores con el nombre real de la zona
                raw_zl = str(item.get('Zona Labores', '')).strip()
                if raw_zl and raw_zl in zonas_emp_map and not raw_zl.endswith(zonas_emp_map[raw_zl]):
                    item['Zona Labores'] = f"{raw_zl} {zonas_emp_map[raw_zl]}"

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
            conn = pyodbc.connect(get_connection_string(), timeout=40)
            cursor = conn.cursor()
            sql = "EXEC SPC_BUSCA_ULTIMO_DIA_ACTIVIDAD_TRABAJADOR @IDEMPRESA = ?, @MES = ?, @ANO = ?"
            cursor.execute(sql, (id_empresa, mes, anio))

            if not cursor.description:
                self.send_json_response(200, {'success': True, 'count': 0, 'headers': [], 'data': []})
                conn.close()
                return

            columns = [col[0] for col in cursor.description]
            raw_rows = cursor.fetchall()

            # Consultar Catálogo de Cuarteles (SPC_CUADRO_PREDIO_CUARTEL) para enriquecer códigos con descripción
            cuarteles_map = {}
            try:
                cursor.execute("EXEC SPC_CUADRO_PREDIO_CUARTEL @IDEMPRESA = ?", (str(id_empresa),))
                while cursor.description is None:
                    if not cursor.nextset():
                        break
                if cursor.description:
                    c_cols = [c[0] for c in cursor.description]
                    c_rows = cursor.fetchall()
                    for cr in c_rows:
                        cd = dict(zip(c_cols, cr))
                        cod = str(cd.get('Cod.Cuartel') or '').strip().upper()
                        cuartel_desc = str(cd.get('Cuartel') or '').strip()
                        nombre_c = str(cd.get('Nombre Cuartel') or '').strip()
                        if cod:
                            cuarteles_map[cod] = cuartel_desc or f"{cod} {nombre_c}".strip()
            except Exception as ce:
                print(f"Warning: No se pudo cargar SPC_CUADRO_PREDIO_CUARTEL: {ce}")

            # Consultar dinámicamente el catálogo de Zonas para la empresa activa desde la tabla [Zona]
            zonas_emp_map = {}
            try:
                cursor.execute("SELECT IdZona, Nombre FROM [Zona] WHERE IdEmpresa = ?", (id_empresa,))
                for zr in cursor.fetchall():
                    zid = str(zr[0]).strip()
                    znom = str(zr[1]).strip()
                    import re
                    clean_z = re.sub(r'\s*\(\s*(?:JOR\s*)?[\d\.]+\s*\)', '', znom, flags=re.IGNORECASE).strip()
                    zonas_emp_map[zid] = clean_z or znom
            except Exception as ze:
                print(f"Warning: No se pudo consultar tabla [Zona]: {ze}")

            conn.close()

            raw_data = self._rows_to_dicts(columns, raw_rows)

            data = []
            for item in raw_data:
                # Formatear ZONA dinámicamente según la empresa seleccionada (ej. 51 -> "51 FUNDO EL PAPAYO" en Rapel, "51 ORGANICOS SAN RAFAEL" en Verfrut)
                if 'ZONA' in item and item['ZONA'] is not None:
                    raw_z = str(item['ZONA']).strip()
                    if raw_z in zonas_emp_map and not raw_z.endswith(zonas_emp_map[raw_z]):
                        item['ZONA'] = f"{raw_z} {zonas_emp_map[raw_z]}"

                # Enriquecer CUARTEL/SECTOR con descripción completa de SPC_CUADRO_PREDIO_CUARTEL
                for k in ['CUARTEL/SECTOR', 'Cuartel', 'CUARTEL', 'SubCentroCosto / Cuartel', 'Sector']:
                    if k in item and item[k]:
                        val_raw = str(item[k]).strip()
                        val_upper = val_raw.upper()
                        if val_upper in cuarteles_map:
                            item[k] = cuarteles_map[val_upper]
                        elif cuarteles_map:
                            import re
                            m = re.match(r'^([A-Z]+)0*(\d+)([A-Z]*)$', val_upper)
                            if m:
                                prefix, num, suffix = m.groups()
                                for cand in [f"{prefix}{int(num):04d}{suffix}", f"{prefix}{int(num):03d}{suffix}", f"{prefix}{int(num):02d}{suffix}", f"{prefix}{int(num)}{suffix}"]:
                                    if cand in cuarteles_map:
                                        item[k] = cuarteles_map[cand]
                                        break

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
        desde = params.get('desde', ['16-08-2026'])[0].replace('/', '-')
        hasta = params.get('hasta', ['31-08-2026'])[0].replace('/', '-')
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

    def handle_api_cuarteles(self, query_str):
        """Consulta: SPC_CUADRO_PREDIO_CUARTEL"""
        try:
            import pyodbc
        except ImportError:
            self.send_json_response(500, {'success': False, 'error': 'pyodbc no está instalado.'})
            return

        params = urllib.parse.parse_qs(query_str)
        id_empresa = str(params.get('idEmpresa', ['14'])[0])

        try:
            conn = pyodbc.connect(get_connection_string(), timeout=25)
            cursor = conn.cursor()
            sql = "EXEC SPC_CUADRO_PREDIO_CUARTEL @IDEMPRESA = ?"
            cursor.execute(sql, (id_empresa,))

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
                'source': f"SQL Server ({SQL_CONFIG['server']}/{SQL_CONFIG['database']})"
            })
        except Exception as e:
            self.send_json_response(500, {'success': False, 'error': f"Error en SPC_CUADRO_PREDIO_CUARTEL: {str(e)}"})

    def handle_api_zonas(self, query_str):
        """Consulta catálogo de Zonas desde la tabla [Zona] según IdEmpresa"""
        try:
            import pyodbc
        except ImportError:
            self.send_json_response(500, {'success': False, 'error': 'pyodbc no está instalado.'})
            return

        params = urllib.parse.parse_qs(query_str)
        id_empresa = int(params.get('idEmpresa', [14])[0])

        try:
            conn = pyodbc.connect(get_connection_string(), timeout=15)
            cursor = conn.cursor()
            cursor.execute("SELECT IdZona, IdEmpresa, Nombre, COD_CENTROCOSTO, NOM_CENTROCOSTO FROM [Zona] WHERE IdEmpresa = ? ORDER BY IdZona", (id_empresa,))

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
            self.send_json_response(500, {'success': False, 'error': f"Error al consultar Zonas: {str(e)}"})

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
    print("\nIniciando aplicación de escritorio...")

    port = find_free_port()
    server_address = ('127.0.0.1', port)
    httpd = HTTPServer(server_address, CustomHTTPHandler)
    url = f"http://127.0.0.1:{port}/index.html"

    # Iniciar servidor HTTP en segundo plano
    server_thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    server_thread.start()

    print(f"[OK] Motor interno activo en: {url}")
    print("[OK] Abriendo ventana nativa de escritorio...")

    # Hilo para establecer el icono nativo de la ventana de Windows (Unifrutti)
    def set_native_window_icon():
        for _ in range(15):
            time.sleep(0.5)
            try:
                import ctypes
                icon_path = get_resource_path('icon.ico')
                if not os.path.exists(icon_path):
                    icon_path = os.path.abspath('icon.ico')
                if os.path.exists(icon_path):
                    IMAGE_ICON = 1
                    LR_LOADFROMFILE = 0x00000010
                    hicon_big = ctypes.windll.user32.LoadImageW(0, icon_path, IMAGE_ICON, 32, 32, LR_LOADFROMFILE)
                    hicon_sm = ctypes.windll.user32.LoadImageW(0, icon_path, IMAGE_ICON, 16, 16, LR_LOADFROMFILE)
                    WM_SETICON = 0x0080
                    ICON_SMALL = 0
                    ICON_BIG = 1

                    found = False
                    def enum_cb(hwnd, lparam):
                        nonlocal found
                        length = ctypes.windll.user32.GetWindowTextLengthW(hwnd)
                        if length > 0:
                            buff = ctypes.create_unicode_buffer(length + 1)
                            ctypes.windll.user32.GetWindowTextW(hwnd, buff, length + 1)
                            title = buff.value
                            if 'Consolidador' in title or 'Unifrutti' in title:
                                if hicon_sm:
                                    ctypes.windll.user32.SendMessageW(hwnd, WM_SETICON, ICON_SMALL, hicon_sm)
                                if hicon_big:
                                    ctypes.windll.user32.SendMessageW(hwnd, WM_SETICON, ICON_BIG, hicon_big)
                                found = True
                        return True

                    WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_int, ctypes.c_int)
                    ctypes.windll.user32.EnumWindows(WNDENUMPROC(enum_cb), 0)
                    if found:
                        break
            except Exception:
                pass

    threading.Thread(target=set_native_window_icon, daemon=True).start()

    use_webview = True
    try:
        import webview
        window = webview.create_window(
            title='Consolidador de Personal, Labores y Marcaciones - Unifrutti',
            url=url,
            width=1360,
            height=880,
            min_size=(1024, 650),
            resizable=True,
            text_select=True,
            confirm_close=False
        )
        webview.start(gui='edgechromium', debug=False)
        print("\nAplicación cerrada por el usuario.")
        httpd.server_close()
        sys.exit(0)
    except Exception as e:
        print(f"Modo ventana alternativa ({e})...")
        use_webview = False

    if not use_webview:
        # Fallback a Edge App Mode (ventana independiente sin barras ni pestañas de navegador)
        import subprocess
        opened = False
        edge_paths = [
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"
        ]
        for ep in edge_paths:
            if os.path.exists(ep):
                try:
                    subprocess.Popen([ep, f"--app={url}", "--window-size=1360,880"])
                    opened = True
                    break
                except Exception:
                    pass

        if not opened:
            webbrowser.open(url)

        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\nCerrando servidor...")
            httpd.server_close()
            sys.exit(0)

if __name__ == '__main__':
    main()
