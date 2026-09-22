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
from http.server import SimpleHTTPRequestHandler, HTTPServer, ThreadingHTTPServer

# Configuración de Base de Datos por defecto (SQL Server)
DEFAULT_SQL_CONFIG = {
    'driver': '{SQL Server}',
    'server': 'vfstbd01',
    'database': 'bsis_rem_afr',
    'uid': 'gpanta',
    'pwd': 'Pantagabriel#98',
    'wsid': 'VFRPTS03',
    'trusted_connection': 'yes'
}

# Catálogo oficial de Empresas
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

def parse_id_empresas(param_val, default=14):
    """Parsea uno o varios IDs de empresa separados por coma o lista."""
    if not param_val:
        return [default]
    if isinstance(param_val, (list, tuple)):
        param_val = ','.join(str(x) for x in param_val)
    ids = []
    for part in str(param_val).split(','):
        part = part.strip()
        if part.isdigit():
            val = int(part)
            if val not in ids:
                ids.append(val)
    return ids or [default]


def get_config_file_path():
    """Obtiene la ruta persistente del archivo sql_config.json junto al ejecutable o script."""
    if getattr(sys, 'frozen', False):
        base_dir = os.path.dirname(sys.executable)
    else:
        base_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base_dir, 'sql_config.json')

def load_sql_config():
    """Carga la configuración desde sql_config.json o crea el archivo con los valores por defecto."""
    config = dict(DEFAULT_SQL_CONFIG)
    config_path = get_config_file_path()
    if os.path.exists(config_path):
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                saved = json.load(f)
                if isinstance(saved, dict):
                    for k in DEFAULT_SQL_CONFIG.keys():
                        if k in saved and saved[k] is not None:
                            config[k] = str(saved[k])
        except Exception as e:
            print(f"Advertencia al leer {config_path}: {e}")
    else:
        try:
            with open(config_path, 'w', encoding='utf-8') as f:
                json.dump(config, f, indent=4, ensure_ascii=False)
        except Exception as e:
            print(f"Advertencia al crear {config_path}: {e}")
    return config

def save_sql_config(new_config):
    """Guarda la nueva configuración de SQL Server en memoria y en el archivo JSON."""
    global SQL_CONFIG
    config_path = get_config_file_path()
    if isinstance(new_config, dict):
        for k in ['driver', 'server', 'database', 'uid', 'pwd', 'wsid', 'trusted_connection']:
            if k in new_config and new_config[k] is not None:
                SQL_CONFIG[k] = str(new_config[k]).strip()
    try:
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(SQL_CONFIG, f, indent=4, ensure_ascii=False)
    except Exception as e:
        print(f"Error al escribir {config_path}: {e}")
    return SQL_CONFIG

# Cargar configuración activa
SQL_CONFIG = load_sql_config()

def get_connection_string(config=None, force_trusted=False):
    cfg = config or SQL_CONFIG
    driver = cfg.get('driver', '{SQL Server}')
    server = cfg.get('server', 'vfstbd01')
    database = cfg.get('database', 'bsis_rem_afr')
    uid = cfg.get('uid', 'gpanta')
    pwd = cfg.get('pwd', '')
    wsid = cfg.get('wsid', '')
    trusted = cfg.get('trusted_connection', '')

    if force_trusted or str(trusted).lower() in ('yes', 'true', '1') or not pwd:
        return (
            f"DRIVER={driver};"
            f"SERVER={server};"
            f"DATABASE={database};"
            f"Trusted_Connection=yes;"
            f"WSID={wsid};"
        )
    return (
        f"DRIVER={driver};"
        f"SERVER={server};"
        f"DATABASE={database};"
        f"UID={uid};"
        f"PWD={pwd};"
        f"WSID={wsid};"
    )

def get_sql_connection(config=None, timeout=60):
    """
    Obtiene una conexión activa a SQL Server.
    Prueba primero la autenticación configurada y si falla con error de login (18456),
    reintenta automáticamente con Autenticación Integrada de Windows (Trusted_Connection=yes).
    """
    import pyodbc
    cfg = config or SQL_CONFIG
    trusted = str(cfg.get('trusted_connection', '')).lower() in ('yes', 'true', '1')
    conn = None
    if trusted:
        conn = pyodbc.connect(get_connection_string(cfg, force_trusted=True), timeout=timeout)
    else:
        try:
            conn = pyodbc.connect(get_connection_string(cfg, force_trusted=False), timeout=timeout)
        except Exception as e_sql:
            try:
                conn = pyodbc.connect(get_connection_string(cfg, force_trusted=True), timeout=timeout)
            except Exception:
                raise e_sql
    if conn:
        try:
            conn.timeout = 120
        except Exception:
            pass
    return conn

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
        elif path == '/api/sql-config':
            self.handle_api_get_sql_config()
        else:
            super().do_GET()

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        if path == '/api/save-excel':
            self.handle_api_save_excel()
        elif path == '/api/open-file':
            self.handle_api_open_file()
        elif path == '/api/test-sql':
            self.handle_api_test_sql_post()
        elif path == '/api/sql-config':
            self.handle_api_save_sql_config()
        else:
            self.send_json_response(404, {'success': False, 'error': 'Endpoint no encontrado'})

    def handle_api_save_excel(self):
        """Guarda el archivo Excel generado en la carpeta Descargas o Escritorio de Windows."""
        try:
            import base64
            content_length = int(self.headers.get('Content-Length', 0))
            post_body = self.rfile.read(content_length)
            payload = json.loads(post_body.decode('utf-8'))

            filename = payload.get('filename') or f"Consolidado_Trabajadores_{datetime.date.today().isoformat()}.xlsx"
            base64_data = payload.get('base64', '')

            # Guardar en la carpeta Descargas del usuario de Windows
            downloads_dir = os.path.join(os.path.expanduser('~'), 'Downloads')
            if not os.path.exists(downloads_dir):
                downloads_dir = os.path.join(os.path.expanduser('~'), 'Descargas')
            if not os.path.exists(downloads_dir):
                downloads_dir = os.path.join(os.path.expanduser('~'), 'Desktop')
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
        """Abre un archivo local en su aplicación predeterminada."""
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

    def handle_api_get_sql_config(self):
        """Retorna la configuración actual de conexión a SQL Server."""
        try:
            self.send_json_response(200, {
                'success': True,
                'config': {
                    'driver': SQL_CONFIG.get('driver', '{SQL Server}'),
                    'server': SQL_CONFIG.get('server', 'vfstbd01'),
                    'database': SQL_CONFIG.get('database', 'bsis_rem_afr'),
                    'uid': SQL_CONFIG.get('uid', 'gpanta'),
                    'pwd': SQL_CONFIG.get('pwd', ''),
                    'wsid': SQL_CONFIG.get('wsid', 'VFRPTS03'),
                    'trusted_connection': SQL_CONFIG.get('trusted_connection', 'yes')
                },
                'config_path': get_config_file_path()
            })
        except Exception as e:
            self.send_json_response(500, {'success': False, 'error': str(e)})

    def handle_api_save_sql_config(self):
        """Guarda la nueva configuración enviada desde la interfaz."""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            post_body = self.rfile.read(content_length)
            payload = json.loads(post_body.decode('utf-8'))

            if not isinstance(payload, dict):
                raise ValueError("El cuerpo debe ser un objeto JSON con los parámetros de conexión.")

            updated = save_sql_config(payload)
            self.send_json_response(200, {
                'success': True,
                'message': 'Configuración de base de datos guardada exitosamente.',
                'config': {
                    'driver': updated.get('driver'),
                    'server': updated.get('server'),
                    'database': updated.get('database'),
                    'uid': updated.get('uid'),
                    'pwd': updated.get('pwd'),
                    'wsid': updated.get('wsid'),
                    'trusted_connection': updated.get('trusted_connection', 'yes')
                }
            })
        except Exception as e:
            self.send_json_response(500, {
                'success': False,
                'error': f"Error al guardar configuración SQL: {str(e)}"
            })

    def handle_api_test_sql_post(self):
        """Prueba de conexión con parámetros opcionales enviados en el cuerpo POST."""
        try:
            import pyodbc
            content_length = int(self.headers.get('Content-Length', 0))
            payload = {}
            if content_length > 0:
                post_body = self.rfile.read(content_length)
                try:
                    payload = json.loads(post_body.decode('utf-8'))
                except Exception:
                    payload = {}

            test_cfg = dict(SQL_CONFIG)
            if isinstance(payload, dict) and payload:
                for k in ['driver', 'server', 'database', 'uid', 'pwd', 'wsid', 'trusted_connection']:
                    if k in payload and payload[k] is not None:
                        test_cfg[k] = str(payload[k]).strip()

            conn = get_sql_connection(test_cfg, timeout=8)
            conn.close()
            self.send_json_response(200, {
                'success': True,
                'message': f"¡Conexión exitosa al servidor {test_cfg['server']} (Base de datos: {test_cfg['database']}, Usuario: {test_cfg['uid']})!"
            })
        except Exception as e:
            self.send_json_response(500, {
                'success': False,
                'error': f"Error al conectar a SQL Server: {str(e)}"
            })

    def handle_api_test_sql(self):
        """Prueba de conexión con los parámetros guardados actualmente."""
        try:
            import pyodbc
            conn = get_sql_connection(timeout=8)
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
        """Consulta: SPC_FICHA_TRABAJADOR_SIN_DATOSSUELDOS (soporta multi-empresa)"""
        try:
            import pyodbc
        except ImportError:
            self.send_json_response(500, {'success': False, 'error': 'pyodbc no está instalado.'})
            return

        now = datetime.datetime.now()
        default_month = now.month
        default_year = now.year

        import calendar

        params = urllib.parse.parse_qs(query_str)
        id_empresas = parse_id_empresas(params.get('idEmpresa', [14]))
        activo = int(params.get('activo', [1])[0])
        mes = int(params.get('mes', [default_month])[0])
        anio = int(params.get('anio', [default_year])[0])

        # Validar y calcular último día exacto para el mes/año
        _, max_day = calendar.monthrange(anio, mes)
        raw_fechaini = params.get('fechaini', [None])[0]
        try:
            if raw_fechaini:
                parts = [int(p) for p in str(raw_fechaini).strip().split('/')]
                if len(parts) == 3:
                    f_day, f_month, f_year = parts[0], parts[1], parts[2]
                    _, f_max_day = calendar.monthrange(f_year, f_month)
                    valid_day = min(max(1, f_day), f_max_day)
                    fechaini = f"{valid_day:02d}/{f_month:02d}/{f_year}"
                else:
                    fechaini = f"{max_day:02d}/{mes:02d}/{anio}"
            else:
                fechaini = f"{max_day:02d}/{mes:02d}/{anio}"
        except Exception:
            fechaini = f"{max_day:02d}/{mes:02d}/{anio}"

        try:
            conn = get_sql_connection(timeout=120)
            cursor = conn.cursor()

            all_columns = ['Empresa']
            data = []
            seen_keys = set()

            for id_empresa in id_empresas:
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
                    print(f"Warning: No se pudo consultar tabla [Zona] para empresa {id_empresa}: {ze}")

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

                while cursor.description is None:
                    if not cursor.nextset():
                        break

                if not cursor.description:
                    continue

                columns = [col[0] for col in cursor.description]
                for col in columns:
                    if col not in all_columns:
                        all_columns.append(col)

                raw_rows = cursor.fetchall()
                raw_data = self._rows_to_dicts(columns, raw_rows)

                for item in raw_data:
                    rut = str(item.get('RutTrabajador', '')).strip()
                    dedupe_key = f"{rut}_{id_empresa}"
                    if not rut or dedupe_key in seen_keys:
                        continue

                    item['IdEmpresa'] = id_empresa
                    item['Empresa'] = EMPRESAS_MAP.get(id_empresa, f'EMPRESA {id_empresa}')

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

                    seen_keys.add(dedupe_key)
                    data.append(item)

            conn.close()

            self.send_json_response(200, {
                'success': True,
                'count': len(data),
                'headers': all_columns,
                'data': data,
                'source': f"SQL Server ({SQL_CONFIG['server']}/{SQL_CONFIG['database']})",
                'params': {'idEmpresa': ','.join(str(x) for x in id_empresas), 'activo': activo, 'mes': mes, 'anio': anio, 'fechaini': fechaini}
            })
        except Exception as e:
            self.send_json_response(500, {'success': False, 'error': f"Error en SPC_FICHA_TRABAJADOR_SIN_DATOSSUELDOS: {str(e)}"})

    def handle_api_ultimo_dia(self, query_str):
        """Consulta: SPC_BUSCA_ULTIMO_DIA_ACTIVIDAD_TRABAJADOR (soporta multi-empresa)"""
        try:
            import pyodbc
        except ImportError:
            self.send_json_response(500, {'success': False, 'error': 'pyodbc no está instalado.'})
            return

        now = datetime.datetime.now()
        params = urllib.parse.parse_qs(query_str)
        id_empresas = parse_id_empresas(params.get('idEmpresa', [14]))
        mes = int(params.get('mes', [now.month])[0])
        anio = int(params.get('anio', [now.year])[0])

        try:
            conn = get_sql_connection(timeout=120)
            cursor = conn.cursor()

            all_columns = []
            data = []

            for id_empresa in id_empresas:
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
                    print(f"Warning: No se pudo cargar SPC_CUADRO_PREDIO_CUARTEL para empresa {id_empresa}: {ce}")

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
                    print(f"Warning: No se pudo consultar tabla [Zona] para empresa {id_empresa}: {ze}")

                sql = "EXEC SPC_BUSCA_ULTIMO_DIA_ACTIVIDAD_TRABAJADOR @IDEMPRESA = ?, @MES = ?, @ANO = ?"
                cursor.execute(sql, (id_empresa, mes, anio))

                while cursor.description is None:
                    if not cursor.nextset():
                        break

                if not cursor.description:
                    continue

                columns = [col[0] for col in cursor.description]
                for col in columns:
                    if col not in all_columns:
                        all_columns.append(col)

                raw_rows = cursor.fetchall()
                raw_data = self._rows_to_dicts(columns, raw_rows)

                for item in raw_data:
                    item['IdEmpresa'] = id_empresa
                    item['Empresa'] = EMPRESAS_MAP.get(id_empresa, f'EMPRESA {id_empresa}')

                    # Formatear ZONA dinámicamente según la empresa seleccionada
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

            conn.close()

            self.send_json_response(200, {
                'success': True,
                'count': len(data),
                'headers': all_columns,
                'data': data,
                'source': f"SQL Server ({SQL_CONFIG['server']}/{SQL_CONFIG['database']})",
                'params': {'idEmpresa': ','.join(str(x) for x in id_empresas), 'mes': mes, 'anio': anio}
            })
        except Exception as e:
            self.send_json_response(500, {'success': False, 'error': f"Error en SPC_BUSCA_ULTIMO_DIA_ACTIVIDAD_TRABAJADOR: {str(e)}"})

    def handle_api_marcaciones(self, query_str):
        """Consulta: SPC_LOGIN_MARCACIONES (soporta 1 día o rango de 3 días, multi-empresa)"""
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
        id_empresas = parse_id_empresas(params.get('idEmpresa', [14]))
        dias = int(params.get('dias', [3])[0])

        # Calcular rango dinámico de 3 fechas hacia atrás
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
                start_dt = now - datetime.timedelta(days=dias - 1)
                fecha_desde = f"{start_dt.day:02d}/{start_dt.month:02d}/{start_dt.year}"
                fecha_hasta = f"{now.day:02d}/{now.month:02d}/{now.year}"

        try:
            conn = get_sql_connection(timeout=120)
            cursor = conn.cursor()

            all_columns = []
            data = []

            for id_empresa in id_empresas:
                sql = "EXEC SPC_LOGIN_MARCACIONES @Fecha = ?, @FechaHasta = ?, @sw_contrato = 0, @IdEmpresa = ?"
                cursor.execute(sql, (fecha_desde, fecha_hasta, id_empresa))

                while cursor.description is None:
                    if not cursor.nextset():
                        break

                if not cursor.description:
                    continue

                columns = [col[0] for col in cursor.description]
                for col in columns:
                    if col not in all_columns:
                        all_columns.append(col)

                raw_rows = cursor.fetchall()
                raw_data = self._rows_to_dicts(columns, raw_rows)
                for item in raw_data:
                    item['IdEmpresa'] = id_empresa
                    item['Empresa'] = EMPRESAS_MAP.get(id_empresa, f'EMPRESA {id_empresa}')
                    data.append(item)

            conn.close()

            self.send_json_response(200, {
                'success': True,
                'count': len(data),
                'headers': all_columns,
                'data': data,
                'source': f"SQL Server ({SQL_CONFIG['server']}/{SQL_CONFIG['database']})",
                'params': {'fechaDesde': fecha_desde, 'fechaHasta': fecha_hasta, 'sw_contrato': sw_contrato, 'idEmpresa': ','.join(str(x) for x in id_empresas), 'dias': dias}
            })
        except Exception as e:
            self.send_json_response(500, {'success': False, 'error': f"Error en SPC_LOGIN_MARCACIONES: {str(e)}"})

    def handle_api_buses(self, query_str):
        """Consulta: SPC_REGISTRO_RUTA (Buses y Rutas, soporta multi-empresa)"""
        try:
            import pyodbc
        except ImportError:
            self.send_json_response(500, {'success': False, 'error': 'pyodbc no está instalado.'})
            return

        params = urllib.parse.parse_qs(query_str)
        cod_pais = params.get('codPais', ['PE'])[0] or params.get('cod_pais', ['PE'])[0]
        now = datetime.datetime.now()
        d_15 = now - datetime.timedelta(days=15)
        default_desde = f"{d_15.day:02d}-{d_15.month:02d}-{d_15.year}"
        default_hasta = f"{now.day:02d}-{now.month:02d}-{now.year}"

        desde = params.get('desde', [default_desde])[0].replace('/', '-')
        hasta = params.get('hasta', [default_hasta])[0].replace('/', '-')

        raw_emp = params.get('idEmpresa', ['0'])[0]
        id_empresas = parse_id_empresas(raw_emp, default=0) if raw_emp and raw_emp != '0' else [0]

        try:
            conn = get_sql_connection(timeout=90)
            cursor = conn.cursor()

            all_columns = []
            data = []
            seen_rutas = set()

            for id_empresa in id_empresas:
                # Ejecutar SPC_REGISTRO_RUTA
                if id_empresa and id_empresa != 0:
                    sql = "EXEC SPC_REGISTRO_RUTA @COD_PAIS = ?, @DESDE = ?, @HASTA = ?, @IDEMPRESA = ?"
                    cursor.execute(sql, (cod_pais, desde, hasta, id_empresa))
                else:
                    sql = "EXEC SPC_REGISTRO_RUTA @COD_PAIS = ?, @DESDE = ?, @HASTA = ?"
                    cursor.execute(sql, (cod_pais, desde, hasta))

                while cursor.description is None:
                    if not cursor.nextset():
                        break

                if not cursor.description:
                    continue

                columns = [col[0] for col in cursor.description]
                for col in columns:
                    if col not in all_columns:
                        all_columns.append(col)

                raw_rows = cursor.fetchall()
                raw_data = self._rows_to_dicts(columns, raw_rows)
                for item in raw_data:
                    key = f"{item.get('Patente', '')}_{item.get('Descripcion Ruta', '')}_{item.get('Codigo Campo', '')}"
                    if key not in seen_rutas:
                        seen_rutas.add(key)
                        data.append(item)

            conn.close()

            self.send_json_response(200, {
                'success': True,
                'count': len(data),
                'headers': all_columns,
                'data': data,
                'source': f"SQL Server ({SQL_CONFIG['server']}/{SQL_CONFIG['database']}) - SPC_REGISTRO_RUTA",
                'params': {'codPais': cod_pais, 'desde': desde, 'hasta': hasta, 'idEmpresa': ','.join(str(x) for x in id_empresas)}
            })
        except Exception as e:
            self.send_json_response(500, {'success': False, 'error': f"Error en SPC_REGISTRO_RUTA: {str(e)}"})

    def handle_api_cuadrillas(self, query_str):
        """Consulta: SPC_DINAMICA_CUADRILLAS (soporta multi-empresa)"""
        try:
            import pyodbc
        except ImportError:
            self.send_json_response(500, {'success': False, 'error': 'pyodbc no está instalado.'})
            return

        params = urllib.parse.parse_qs(query_str)
        id_empresas = parse_id_empresas(params.get('idEmpresa', [14]))

        try:
            conn = get_sql_connection(timeout=90)
            cursor = conn.cursor()

            all_columns = []
            data = []
            seen_cuads = set()

            for id_empresa in id_empresas:
                sql = "EXEC SPC_DINAMICA_CUADRILLAS @EMPRESA = ?"
                cursor.execute(sql, (id_empresa,))

                while cursor.description is None:
                    if not cursor.nextset():
                        break

                if not cursor.description:
                    continue

                columns = [col[0] for col in cursor.description]
                for col in columns:
                    if col not in all_columns:
                        all_columns.append(col)

                raw_rows = cursor.fetchall()
                raw_data = self._rows_to_dicts(columns, raw_rows)
                for item in raw_data:
                    item['IdEmpresa'] = id_empresa
                    item['Empresa'] = EMPRESAS_MAP.get(id_empresa, f'EMPRESA {id_empresa}')
                    c_id = f"{item.get('IDCUADRILLA', '')}_{id_empresa}"
                    if c_id not in seen_cuads:
                        seen_cuads.add(c_id)
                        data.append(item)

            conn.close()

            self.send_json_response(200, {
                'success': True,
                'count': len(data),
                'headers': all_columns,
                'data': data,
                'source': f"SQL Server ({SQL_CONFIG['server']}/{SQL_CONFIG['database']})"
            })
        except Exception as e:
            self.send_json_response(500, {'success': False, 'error': f"Error en SPC_DINAMICA_CUADRILLAS: {str(e)}"})

    def handle_api_cuarteles(self, query_str):
        """Consulta: SPC_CUADRO_PREDIO_CUARTEL (soporta multi-empresa)"""
        try:
            import pyodbc
        except ImportError:
            self.send_json_response(500, {'success': False, 'error': 'pyodbc no está instalado.'})
            return

        params = urllib.parse.parse_qs(query_str)
        id_empresas = parse_id_empresas(params.get('idEmpresa', [14]))

        try:
            conn = get_sql_connection(timeout=45)
            cursor = conn.cursor()

            all_columns = []
            data = []

            for id_empresa in id_empresas:
                sql = "EXEC SPC_CUADRO_PREDIO_CUARTEL @IDEMPRESA = ?"
                cursor.execute(sql, (str(id_empresa),))

                while cursor.description is None:
                    if not cursor.nextset():
                        break

                if not cursor.description:
                    continue

                columns = [col[0] for col in cursor.description]
                for col in columns:
                    if col not in all_columns:
                        all_columns.append(col)

                raw_rows = cursor.fetchall()
                raw_data = self._rows_to_dicts(columns, raw_rows)
                for item in raw_data:
                    item['IdEmpresa'] = id_empresa
                    item['Empresa'] = EMPRESAS_MAP.get(id_empresa, f'EMPRESA {id_empresa}')
                    data.append(item)

            conn.close()

            self.send_json_response(200, {
                'success': True,
                'count': len(data),
                'headers': all_columns,
                'data': data,
                'source': f"SQL Server ({SQL_CONFIG['server']}/{SQL_CONFIG['database']})"
            })
        except Exception as e:
            self.send_json_response(500, {'success': False, 'error': f"Error en SPC_CUADRO_PREDIO_CUARTEL: {str(e)}"})

    def handle_api_zonas(self, query_str):
        """Consulta catálogo de Zonas desde la tabla [Zona] según IdEmpresa (soporta multi-empresa)"""
        try:
            import pyodbc
        except ImportError:
            self.send_json_response(500, {'success': False, 'error': 'pyodbc no está instalado.'})
            return

        params = urllib.parse.parse_qs(query_str)
        id_empresas = parse_id_empresas(params.get('idEmpresa', [14]))

        try:
            conn = get_sql_connection(timeout=30)
            cursor = conn.cursor()

            all_columns = []
            data = []

            for id_empresa in id_empresas:
                cursor.execute("SELECT IdZona, IdEmpresa, Nombre, COD_CENTROCOSTO, NOM_CENTROCOSTO FROM [Zona] WHERE IdEmpresa = ? ORDER BY IdZona", (id_empresa,))

                columns = [col[0] for col in cursor.description]
                for col in columns:
                    if col not in all_columns:
                        all_columns.append(col)

                raw_rows = cursor.fetchall()
                raw_data = self._rows_to_dicts(columns, raw_rows)
                for item in raw_data:
                    item['Empresa'] = EMPRESAS_MAP.get(id_empresa, f'EMPRESA {id_empresa}')
                    data.append(item)

            conn.close()

            self.send_json_response(200, {
                'success': True,
                'count': len(data),
                'headers': all_columns,
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
    print(f"  Conector SQL Server: {SQL_CONFIG.get('server')} ({SQL_CONFIG.get('database')}) | Usuario: {SQL_CONFIG.get('uid')}")
    print(f"  Archivo de Configuración: {get_config_file_path()}")
    print("=" * 65)
    print("\nIniciando aplicación de escritorio...")

    port = find_free_port()
    server_address = ('127.0.0.1', port)
    httpd = ThreadingHTTPServer(server_address, CustomHTTPHandler)
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

                    SW_MAXIMIZE = 3
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
                                ctypes.windll.user32.ShowWindow(hwnd, SW_MAXIMIZE)
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
            confirm_close=False,
            maximized=True
        )
        webview.start(gui='edgechromium', debug=False)
        print("\nAplicación cerrada por el usuario.")
        httpd.server_close()
        sys.exit(0)
    except Exception as e:
        print(f"Modo ventana alternativa ({e})...")
        use_webview = False

    if not use_webview:
        # Fallback a Edge App Mode (ventana independiente maximizada sin barras ni pestañas)
        import subprocess
        opened = False
        edge_paths = [
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"
        ]
        for ep in edge_paths:
            if os.path.exists(ep):
                try:
                    subprocess.Popen([ep, f"--app={url}", "--start-maximized"])
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
