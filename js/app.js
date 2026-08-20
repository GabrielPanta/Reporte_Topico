/**
 * Aplicativo Web de Consolidación de Trabajadores, Labores y Marcaciones
 * Motor de procesamiento 100% en el cliente (Navegador) - Versión PRO v2.0
 * 
 * Reglas de Mapeo y Cruce de Datos (23 Columnas):
 * 1. Regimen
 * 2. Tiene Digitacion (jornal)
 * 3. RutTrabajador
 * 4. CodigoTrabajador
 * 5. Apellidos y Nombres (Concatenación inteligente de Ap.Paterno + Ap.Materno + Nombres)
 * 6. FechaNacimiento
 * 7. Sexo
 * 8. Edad
 * 9. FechaInicioPeriodo
 * 10. FechaInicioContrato
 * 11. FechaTerminoContrato
 * 12. Oficio
 * 13. Zona Labores
 * 14. SubCentroCosto / Cuartel
 * 15. ACTIVIDAD
 * 16. LABOR
 * 17. ENCARGADO (Cruce con Catálogo de Cuadrillas)
 * 18. PLACA (Marcaciones TIPO_ESTACION = BUS)
 * 19. CODIGO BUS (Cruce con Catálogo de Buses)
 * 20. RUTA (Cruce con Catálogo de Buses)
 * 21. TURNO (Formato Hora HH:MM)
 * 22. HASTA
 * 23. ESTADO (ACTIVO con marcación/digitación NO, AUSENTE sin marcación, o inasistencia justificada)
 */

(function () {
  'use strict';

  // Schema de salida exacto solicitado (24 columnas)
  const TARGET_COLUMNS = [
    'Empresa',
    'Regimen',
    'Tiene Digitacion (jornal)',
    'RutTrabajador',
    'CodigoTrabajador',
    'Apellidos y Nombres',
    'FechaNacimiento',
    'Sexo',
    'Edad',
    'FechaInicioPeriodo',
    'FechaInicioContrato',
    'FechaTerminoContrato',
    'Oficio',
    'Zona Labores',
    'SubCentroCosto / Cuartel',
    'ACTIVIDAD',
    'LABOR',
    'ENCARGADO',
    'PLACA',
    'CODIGO BUS',
    'RUTA',
    'TURNO',
    'HASTA',
    'ESTADO'
  ];

  // Columnas prioritarias del Archivo 2 (Último Día Laborado)
  const FILE2_PRIORITY_COLUMNS = [
    'Tiene Digitacion (jornal)',
    'Zona Labores',
    'SubCentroCosto / Cuartel',
    'ACTIVIDAD',
    'LABOR',
    'ENCARGADO',
    'PLACA',
    'CODIGO BUS',
    'RUTA',
    'TURNO',
    'HASTA'
  ];

  // Palabras clave para detectar ausencias justificadas / licencias / permisos
  const ABSENCE_KEYWORDS = [
    'PERMISO CON',
    'PERMISO SIN',
    'PERMISO',
    'VACACION',
    'VACACIONES',
    'LICENCIA',
    'LICENCIAS',
    'PERSONAL CON S.P.L',
    'PERSONAL CON SPL',
    'S.P.L',
    'SPL',
    'FALTA JUSTIFICADA',
    'FALTA INJUSTIFICADA',
    'FALTA',
    'INASISTENCIA',
    'DESCANSO MEDICO',
    'DESCANSO',
    'MEDICO',
    'MATERNIDAD',
    'PATERNIDAD',
    'SUSPENSION',
    'INCAPACIDAD',
    'SUBSIDIO',
    'LUTO',
    'SINDICAL',
    'COMPENSATORIO',
    'AISLAMIENTO',
    'CUARENTENA',
    'CESE'
  ];

  // Helper para verificar si un trabajador está finiquitado o no vigente
  function isWorkerFiniquitado(row) {
    if (!row) return false;
    for (const [key, rawVal] of Object.entries(row)) {
      if (rawVal === undefined || rawVal === null || rawVal === '') continue;
      const clean = cleanHeader(key);
      const strVal = String(rawVal).trim().toLowerCase();
      if (strVal === '' || strVal === 'none' || strVal === 'null') continue;

      if (clean.includes('fechafiniquito') || clean.includes('fecfiniquito') || clean.includes('causalenfiniquito') || clean.includes('causalfiniquito')) {
        return true;
      }
      if (clean === 'vigencia' || clean === 'vigenciaultimocontrato' || clean === 'vigente') {
        if (strVal === 'no' || strVal === 'false' || strVal === '0') return true;
      }
      if (clean === 'nrodefiniquitados' && strVal !== '0') {
        return true;
      }
      if (clean.includes('estadotrabajador') || clean.includes('situaciontrabajador') || clean.includes('condiciontrabajador')) {
        if (strVal.includes('cesad') || strVal.includes('finiquit') || strVal.includes('inactiv') || strVal.includes('baja')) return true;
      }
    }
    return false;
  }

  // Catálogo de Empresas
  const EMPRESAS_MAP = {
    '1': 'SOCIEDAD AGRICOLA EL PORVENIR S.A.',
    '2': 'EL DURAZNO',
    '3': 'LOS PARRONES',
    '4': 'QUILAMUTA',
    '5': 'INVERSIONES RVD LIMITADA',
    '7': 'AGRICOLA PILARES VERDES SPA',
    '8': 'SOC. EXPORTADORA VERFRUT SPA',
    '9': 'SOCIEDAD AGRÍCOLA RAPEL S. A. C.',
    '11': 'INMOBILIARIA FARALEUFU LIMITADA',
    '12': 'ALGARROBOS PIURA SAC',
    '14': 'SOCIEDAD EXPORTADORA VERFRUT S. A. C.',
    '16': 'AGRICOLA PJM LIMITADA',
    '17': 'AGRICOLA VERCELING CHILE LIMITADA',
    '19': 'AGRICOLA EL PEÑASCO SPA',
    '20': 'SKY WINGS SPA',
    '21': 'AGRICOLA EL REMANSO LTDA',
    '22': 'BODEGAS LOS LIRIOS SPA',
    '23': 'AGRICOLA AVANTI S.A.C.',
    '31': 'BOMAREA S.R.L',
    '32': 'INVERSIONES MOSQUETA S.A.C.',
    '33': 'INVERSIONES PIRONA S.A.C.',
    '34': 'INVERSIONES LEFKADA S.A.C.',
    '35': 'INVERSIONES HEFEI S.A.C.'
  };

  // Mapeo de alias normalizados
  const COLUMN_ALIASES = {
    'Empresa': ['empresa', 'idempresa', 'nombreempresa', 'razonsocial', 'compania', 'cia', 'nomempresa', 'emp', 'nom_empresa', 'razon_social'],
    'Regimen': ['regimen', 'regimenlaboral', 'tiporegimen'],
    'Tiene Digitacion (jornal)': ['tienedigitacionjornal', 'tienedigitacion', 'digitacion', 'jornal', 'tienejornal', 'digitado', 'esjornal', 'tienedigitaciondejornal'],
    'RutTrabajador': ['ruttrabajador', 'rut', 'dni', 'documento', 'docidentidad', 'cedula', 'identificacion', 'numdoc', 'rutdeltrabajador', 'dnidrabajador'],
    'CodigoTrabajador': ['codigotrabajador', 'codigo', 'codtrabajador', 'codempleado', 'idtrabajador', 'ficha', 'codpersonal', 'codigodeltrabajador'],
    'Apellidos y Nombres': ['apellidosynombres', 'nombresyapellidos', 'nombrecompleto', 'apellidosnombres', 'nombresapellidos', 'apellidosynombre', 'apellidoynombres', 'apellidoynombre', 'nombreyapellidos', 'nombreyapellido', 'nomcompleto'],
    'FechaNacimiento': ['fechanacimiento', 'fecnac', 'nacimiento', 'fecnacimiento'],
    'Sexo': ['sexo', 'genero'],
    'Edad': ['edad', 'anios', 'anos'],
    'FechaInicioPeriodo': ['fechainicioperiodo', 'inicioperiodo', 'fecinicioperiodo'],
    'FechaInicioContrato': ['fechainiciocontrato', 'iniciocontrato', 'fecingreso', 'fechaingreso', 'fecinicon'],
    'FechaTerminoContrato': ['fechaterminocontrato', 'terminocontrato', 'fecfincon', 'fechacese', 'fechafincontrato'],
    'Oficio': ['oficio', 'cargo', 'puesto', 'ocupacion', 'categoria', 'laborhabitual'],
    'Zona Labores': ['zonalabores', 'zonadelabores', 'zona', 'sede', 'fundo', 'campo', 'ubicacion', 'lugar', 'zonatrabajo', 'desczona', 'nombrezona'],
    'SubCentroCosto / Cuartel': ['subcentrocostocuartel', 'subcentrocosto', 'cuartel', 'centrocosto', 'centrodecosto', 'ceco', 'subceco', 'lote', 'valvula', 'nomcuartel', 'area', 'seccion'],
    'ACTIVIDAD': ['actividad', 'tipoactividad', 'motivo', 'condicion', 'situacion', 'tipoausencia', 'actividadactual'],
    'LABOR': ['labor', 'labores', 'detallelabor', 'tarea', 'descripcionlabor', 'laborrealizada', 'nombrelabor'],
    'ENCARGADO': ['encargado', 'supervisor', 'jefe', 'responsable', 'capataz', 'lider', 'supervisorcampo'],
    'PLACA': ['nombreestacion', 'estacion', 'estaciontrabajo', 'nomestacion', 'placa', 'placavehiculo', 'vehiculo', 'placabus', 'movil'],
    'CODIGO BUS': ['codigobus', 'codbus', 'bus', 'transporte', 'nrobus'],
    'RUTA': ['ruta', 'linea', 'recorrido', 'origendestino', 'rutatransporte'],
    'TURNO': ['horainicio', 'horaingreso', 'horarioinicio', 'turno', 'horario', 'jornada', 'tipoturno'],
    'HASTA': ['ultimodia', 'fechaultimodia', 'fecultdia', 'ultimodialaborado', 'hasta', 'fechahasta', 'fec_hasta', 'vigenciahasta']
  };

  // State Management
  const state = {
    file1: { data: null, name: null, headers: [], keyCol: '', patCol: '', matCol: '', nomCol: '', workbook: null, sheetNames: [], selectedSheet: '' },
    file2: { data: null, name: null, headers: [], keyCol: '', actCol: '', laborCol: '', turnoCol: '', cuadrillaCol: '', workbook: null, sheetNames: [], selectedSheet: '' },
    file3: { data: null, name: null, headers: [], keyCol: '', nomEstCol: '', tipoEstCol: '', workbook: null, sheetNames: [], selectedSheet: '' },
    file4: { data: null, name: null, headers: [], patenteCol: '', codBusCol: '', rutaCol: '', workbook: null, sheetNames: [], selectedSheet: '' },
    file5: { data: null, name: null, headers: [], idCuadrillaCol: '', descCol: '', nombreEncargadoCol: '', workbook: null, sheetNames: [], selectedSheet: '' },
    consolidatedData: [],
    filteredData: [],
    currentPage: 1,
    pageSize: 15,
    activeFilter: 'ALL',
    searchTerm: '',
    sortColumn: 'RutTrabajador',
    sortDirection: 'asc',
    visibleColumns: new Set(TARGET_COLUMNS),
    metrics: { total: 0, active: 0, leave: 0, absent: 0 }
  };

  // DOM Elements Cache
  const elements = {
    // Header & Actions
    btnThemeToggle: document.getElementById('btn-theme-toggle'),
    btnLoadDemo: document.getElementById('btn-load-demo'),
    btnShortcuts: document.getElementById('btn-shortcuts'),
    btnHelp: document.getElementById('btn-help'),
    btnProcess: document.getElementById('btn-process'),
    btnResetAll: document.getElementById('btn-reset-all'),
    btnExportExcel: document.getElementById('btn-export-excel'),
    btnExportCsv: document.getElementById('btn-export-csv'),
    btnCopyTable: document.getElementById('btn-copy-table'),
    btnPrintTable: document.getElementById('btn-print-table'),

    // Step Wizard
    step1: document.getElementById('step-1'),
    step2: document.getElementById('step-2'),
    step3: document.getElementById('step-3'),
    step1Desc: document.getElementById('step-1-desc'),

    // Cards, Dropzones & File Info
    card1: document.getElementById('card-1'),
    card2: document.getElementById('card-2'),
    card3: document.getElementById('card-3'),
    card4: document.getElementById('card-4'),
    card5: document.getElementById('card-5'),
    dropzone1: document.getElementById('dropzone-1'),
    dropzone2: document.getElementById('dropzone-2'),
    dropzone3: document.getElementById('dropzone-3'),
    dropzone4: document.getElementById('dropzone-4'),
    dropzone5: document.getElementById('dropzone-5'),
    fileInput1: document.getElementById('file-input-1'),
    fileInput2: document.getElementById('file-input-2'),
    fileInput3: document.getElementById('file-input-3'),
    fileInput4: document.getElementById('file-input-4'),
    fileInput5: document.getElementById('file-input-5'),
    fileInfo1: document.getElementById('file-info-1'),
    fileInfo2: document.getElementById('file-info-2'),
    fileInfo3: document.getElementById('file-info-3'),
    fileInfo4: document.getElementById('file-info-4'),
    fileInfo5: document.getElementById('file-info-5'),

    // Selects
    sheetGroup1: document.getElementById('sheet-group-1'),
    sheetGroup2: document.getElementById('sheet-group-2'),
    sheetGroup3: document.getElementById('sheet-group-3'),
    sheetGroup4: document.getElementById('sheet-group-4'),
    sheetGroup5: document.getElementById('sheet-group-5'),
    sheetSelect1: document.getElementById('sheet-select-1'),
    sheetSelect2: document.getElementById('sheet-select-2'),
    sheetSelect3: document.getElementById('sheet-select-3'),
    sheetSelect4: document.getElementById('sheet-select-4'),
    sheetSelect5: document.getElementById('sheet-select-5'),
    keySelect1: document.getElementById('key-select-1'),
    paternoSelect1: document.getElementById('paterno-select-1'),
    maternoSelect1: document.getElementById('materno-select-1'),
    nombresSelect1: document.getElementById('nombres-select-1'),
    keySelect2: document.getElementById('key-select-2'),
    actSelect2: document.getElementById('act-select-2'),
    laborSelect2: document.getElementById('labor-select-2'),
    turnoSelect2: document.getElementById('turno-select-2'),
    cuadrillaSelect2: document.getElementById('cuadrilla-select-2'),
    keySelect3: document.getElementById('key-select-3'),
    nomEstSelect3: document.getElementById('nom-est-select-3'),
    tipoEstSelect3: document.getElementById('tipo-est-select-3'),
    patenteSelect4: document.getElementById('patente-select-4'),
    codBusSelect4: document.getElementById('cod-bus-select-4'),
    rutaSelect4: document.getElementById('ruta-select-4'),
    idcuadrillaSelect5: document.getElementById('idcuadrilla-select-5'),
    descCuadrillaSelect5: document.getElementById('desc-cuadrilla-select-5'),
    nombreEncargadoSelect5: document.getElementById('nombre-encargado-select-5'),

    // Results Section & Distribution
    resultsSection: document.getElementById('results-section'),
    distActive: document.getElementById('dist-active'),
    distAbsent: document.getElementById('dist-absent'),
    distLeave: document.getElementById('dist-leave'),
    pctActive: document.getElementById('pct-active'),
    pctAbsent: document.getElementById('pct-absent'),
    pctLeave: document.getElementById('pct-leave'),
    kpiPctActive: document.getElementById('kpi-pct-active'),
    kpiPctAbsent: document.getElementById('kpi-pct-absent'),
    kpiPctLeave: document.getElementById('kpi-pct-leave'),
    metricTotal: document.getElementById('metric-total'),
    metricActive: document.getElementById('metric-active'),
    metricAbsent: document.getElementById('metric-absent'),
    metricLeave: document.getElementById('metric-leave'),

    // Table, Search & Filter Controls
    tableSearch: document.getElementById('table-search'),
    btnClearSearch: document.getElementById('btn-clear-search'),
    filterChips: document.querySelectorAll('.filter-chip'),
    countChipAll: document.getElementById('count-chip-all'),
    countChipActive: document.getElementById('count-chip-active'),
    countChipAbsent: document.getElementById('count-chip-absent'),
    countChipLeave: document.getElementById('count-chip-leave'),
    btnToggleColumns: document.getElementById('btn-toggle-columns'),
    columnsDropdownMenu: document.getElementById('columns-dropdown-menu'),
    columnsCheckboxList: document.getElementById('columns-checkbox-list'),
    selectPageSize: document.getElementById('select-page-size'),
    tableHead: document.getElementById('table-head'),
    tableBody: document.getElementById('table-body'),

    // Pagination
    pageStart: document.getElementById('page-start'),
    pageEnd: document.getElementById('page-end'),
    pageTotal: document.getElementById('page-total'),
    btnFirstPage: document.getElementById('btn-first-page'),
    btnPrevPage: document.getElementById('btn-prev-page'),
    btnNextPage: document.getElementById('btn-next-page'),
    btnLastPage: document.getElementById('btn-last-page'),
    pageNumDisplay: document.getElementById('page-num-display'),

    // Modals
    modalHelp: document.getElementById('modal-help'),
    btnCloseModal: document.getElementById('btn-close-modal'),
    modalShortcuts: document.getElementById('modal-shortcuts'),
    btnCloseShortcuts: document.getElementById('btn-close-shortcuts'),
    modalPreview: document.getElementById('modal-preview'),
    btnClosePreview: document.getElementById('btn-close-preview'),
    previewTitle: document.getElementById('preview-title'),
    previewSubtitle: document.getElementById('preview-subtitle'),
    previewTableContainer: document.getElementById('preview-table-container'),
    modalDossier: document.getElementById('modal-dossier'),
    btnCloseDossier: document.getElementById('btn-close-dossier'),
    dossierWorkerName: document.getElementById('dossier-worker-name'),
    dossierWorkerDni: document.getElementById('dossier-worker-dni'),
    dossierStatusBadge: document.getElementById('dossier-status-badge'),
    dossierAvatar: document.getElementById('dossier-avatar'),
    dossierBody: document.getElementById('dossier-body'),

    // SQL Server Controls
    btnLoadAllSql: document.getElementById('btn-load-all-sql'),
    btnLoadSql: document.getElementById('btn-load-sql'),
    btnLoadSqlHeader: document.getElementById('btn-load-sql-header'),
    btnOpenSqlParams: document.getElementById('btn-open-sql-params'),
    modalSqlParams: document.getElementById('modal-sql-params'),
    btnCloseSqlParams: document.getElementById('btn-close-sql-params'),
    btnCancelSqlParams: document.getElementById('btn-cancel-sql-params'),
    formSqlParams: document.getElementById('form-sql-params'),
    dbStatusBadge: document.getElementById('db-status-badge'),
    sqlParamEmpresa: document.getElementById('sql-param-empresa'),
    sqlParamActivo: document.getElementById('sql-param-activo'),
    sqlParamMes: document.getElementById('sql-param-mes'),
    sqlParamAnio: document.getElementById('sql-param-anio'),
    sqlParamFechaini: document.getElementById('sql-param-fechaini'),

    // Card 2 SQL Controls (Último Día)
    btnLoadSql2: document.getElementById('btn-load-sql-2'),
    btnOpenSqlParams2: document.getElementById('btn-open-sql-params-2'),
    modalSqlParams2: document.getElementById('modal-sql-params-2'),
    btnCloseSqlParams2: document.getElementById('btn-close-sql-params-2'),
    btnCancelSqlParams2: document.getElementById('btn-cancel-sql-params-2'),
    formSqlParams2: document.getElementById('form-sql-params-2'),
    sqlParam2Empresa: document.getElementById('sql-param-2-empresa'),
    sqlParam2Mes: document.getElementById('sql-param-2-mes'),
    sqlParam2Anio: document.getElementById('sql-param-2-anio'),

    // Card 3 SQL Controls (Marcaciones - SPC_LOGIN_MARCACIONES)
    btnLoadSql3: document.getElementById('btn-load-sql-3'),
    btnOpenSqlParams3: document.getElementById('btn-open-sql-params-3'),
    modalSqlParams3: document.getElementById('modal-sql-params-3'),
    btnCloseSqlParams3: document.getElementById('btn-close-sql-params-3'),
    btnCancelSqlParams3: document.getElementById('btn-cancel-sql-params-3'),
    formSqlParams3: document.getElementById('form-sql-params-3'),
    sqlParam3Fecha: document.getElementById('sql-param-3-fecha'),
    sqlParam3Dias: document.getElementById('sql-param-3-dias'),
    sqlParam3Empresa: document.getElementById('sql-param-3-empresa'),
    sqlParam3Sw: document.getElementById('sql-param-3-sw'),

    // Cards 4 & 5 SQL Controls (Buses & Cuadrillas)
    btnLoadSql4: document.getElementById('btn-load-sql-4'),
    btnLoadSql5: document.getElementById('btn-load-sql-5'),

    // Toast Container
    toastContainer: document.getElementById('toast-container')
  };

  // Keywords for primary keys
  const ID_KEYWORDS = ['ruttrabajador', 'rut', 'dni', 'documento', 'docidentidad', 'identificacion', 'codigotrabajador', 'codigo', 'cod', 'codtrabajador', 'id', 'cedula'];
  const ACTIVITY_KEYWORDS = ['actividad', 'tipoactividad', 'motivo', 'condicion', 'situacion', 'licencia', 'tipoausencia'];
  const LABOR_KEYWORDS = ['labor', 'labores', 'detallelabor', 'tarea', 'descripcionlabor', 'laborrealizada'];

  // Normalizador de texto para comparaciones
  function cleanHeader(header) {
    if (!header) return '';
    return String(header)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, '');
  }

  // Normalizador de valores de celdas
  function formatCellValue(val) {
    if (val === null || val === undefined) return '';
    if (val instanceof Date) {
      if (isNaN(val.getTime())) return '';
      if (val.getFullYear() <= 1900) {
        return formatTimeValue(val);
      }
      const y = val.getFullYear();
      const m = String(val.getMonth() + 1).padStart(2, '0');
      const d = String(val.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return String(val).trim();
  }

  // Formateador estricto para campos de HORA -> "HH:MM"
  function formatTimeValue(val) {
    if (val === null || val === undefined || val === '') return '';
    const strVal = String(val).trim();
    if (strVal === '(en blanco)' || strVal === '-' || strVal.toLowerCase() === 'null') return '';

    if (val instanceof Date) {
      if (isNaN(val.getTime())) return '';
      const h = String(val.getHours()).padStart(2, '0');
      const m = String(val.getMinutes()).padStart(2, '0');
      return `${h}:${m}`;
    }

    if (typeof val === 'number' && !isNaN(val)) {
      if (val >= 0 && val < 1) {
        const totalSeconds = Math.round(val * 86400);
        const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
        const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
        return `${h}:${m}`;
      }
    }

    const timeMatch = strVal.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?/i);
    if (timeMatch) {
      let h = parseInt(timeMatch[1], 10);
      const m = timeMatch[2];
      const ampm = timeMatch[4];
      if (ampm) {
        if (ampm.toUpperCase() === 'PM' && h < 12) h += 12;
        if (ampm.toUpperCase() === 'AM' && h === 12) h = 0;
      }
      return `${String(h).padStart(2, '0')}:${m}`;
    }

    return strVal;
  }

  // Extrae el valor raw sin pre-formatear
  function extractRawFromRow(row, aliasList) {
    if (!row) return null;
    const rowKeys = Object.keys(row);

    // Pase 1: Coincidencia Exacta
    for (const alias of aliasList) {
      const cleanAlias = cleanHeader(alias);
      for (const key of rowKeys) {
        const cleanKey = cleanHeader(key);
        if (cleanKey === cleanAlias) {
          const rawVal = row[key];
          if (rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== '' && String(rawVal).trim() !== '(en blanco)') {
            return rawVal;
          }
        }
      }
    }

    // Pase 2: Coincidencia por subcadena protegida
    for (const alias of aliasList) {
      const cleanAlias = cleanHeader(alias);
      for (const key of rowKeys) {
        const cleanKey = cleanHeader(key);

        // Guardas de seguridad para evitar colisiones
        if (cleanAlias.includes('zona') && (cleanKey === 'labor' || cleanKey === 'labores' || cleanKey.includes('oficio'))) continue;
        if ((cleanAlias === 'labor' || cleanAlias === 'labores') && cleanKey.includes('zona')) continue;
        if (cleanAlias.includes('zona') && (cleanKey.includes('cuadrilla') || cleanKey.includes('encargado'))) continue;

        if (cleanKey.includes(cleanAlias) || (cleanKey.length >= 4 && cleanAlias.includes(cleanKey))) {
          const rawVal = row[key];
          if (rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== '' && String(rawVal).trim() !== '(en blanco)') {
            return rawVal;
          }
        }
      }
    }
    return null;
  }

  // Helper detectores de nombres y apellidos
  function isPaternoHeader(header) {
    if (!header) return false;
    const c = cleanHeader(header);
    if (c.includes('patern')) return true;
    if (c.includes('pat') && (c.includes('ape') || c.includes('ap') || c.includes('pri') || c.includes('1'))) return true;
    if (['apellidop', 'apep', 'app', 'apellido1', 'ape1', 'ap1', 'paterno', 'pat'].includes(c)) return true;
    return false;
  }

  function isMaternoHeader(header) {
    if (!header) return false;
    const c = cleanHeader(header);
    if (c.includes('matern')) return true;
    if (c.includes('mat') && (c.includes('ape') || c.includes('ap') || c.includes('seg') || c.includes('2'))) return true;
    if (['apellidom', 'apem', 'apm', 'apellido2', 'ape2', 'ap2', 'materno', 'mat'].includes(c)) return true;
    return false;
  }

  function isNombresHeader(header) {
    if (!header) return false;
    const c = cleanHeader(header);
    if (c.includes('patern') || c.includes('matern')) return false;
    if (c.includes('nombr') || c.includes('nom')) {
      if (c.includes('apell') && !c.includes('ynomb') && !c.includes('nomb')) return false;
      return true;
    }
    return false;
  }

  function extractNameComponents(row) {
    if (!row) return {};
    let apePat = '', apeMat = '', apellidosCombined = '', primerNombre = '', segundoNombre = '', nombresCombined = '', strictFullName = '', fallbackFullName = '';

    for (const [key, rawVal] of Object.entries(row)) {
      if (rawVal === undefined || rawVal === null || rawVal === '') continue;
      const clean = cleanHeader(key);
      const val = formatCellValue(rawVal);
      if (!val) continue;

      if (isPaternoHeader(key)) {
        if (!apePat) apePat = val;
      } else if (isMaternoHeader(key)) {
        if (!apeMat) apeMat = val;
      } else if (clean.includes('apell') && !clean.includes('nom') && !clean.includes('pat') && !clean.includes('mat')) {
        if (!apellidosCombined) apellidosCombined = val;
      } else if (clean.includes('nom') && (clean.includes('pri') || clean.includes('1'))) {
        if (!primerNombre) primerNombre = val;
      } else if (clean.includes('nom') && (clean.includes('seg') || clean.includes('2'))) {
        if (!segundoNombre) segundoNombre = val;
      } else if (clean.includes('apellidosynombres') || clean.includes('nombresyapellidos') || clean === 'nombrecompleto') {
        if (!strictFullName) strictFullName = val;
      } else if (isNombresHeader(key)) {
        if (!nombresCombined) nombresCombined = val;
      } else if (['trabajador', 'colaborador', 'empleado', 'personal'].includes(clean)) {
        if (!fallbackFullName) fallbackFullName = val;
      }
    }

    return { apePat, apeMat, apellidosCombined, primerNombre, segundoNombre, nombresCombined, strictFullName, fallbackFullName };
  }

  function getFullName(row1, row2) {
    const comp1 = extractNameComponents(row1);
    const comp2 = extractNameComponents(row2);

    const apePat = comp1.apePat || comp2.apePat || '';
    const apeMat = comp1.apeMat || comp2.apeMat || '';
    const apellidosCombined = comp1.apellidosCombined || comp2.apellidosCombined || '';
    const primerNombre = comp1.primerNombre || comp2.primerNombre || '';
    const segundoNombre = comp1.segundoNombre || comp2.segundoNombre || '';
    const nombresCombined = comp1.nombresCombined || comp2.nombresCombined || '';
    const strictFullName = comp1.strictFullName || comp2.strictFullName || '';
    const fallbackFullName = comp1.fallbackFullName || comp2.fallbackFullName || '';

    let fullApe = '';
    if (apePat || apeMat) {
      fullApe = [apePat, apeMat].filter(Boolean).join(' ').trim();
    } else if (apellidosCombined) {
      fullApe = apellidosCombined.trim();
    }

    let fullNom = '';
    const separateNames = [primerNombre, segundoNombre].filter(Boolean).join(' ').trim();
    if (separateNames) {
      fullNom = separateNames;
    } else if (nombresCombined) {
      fullNom = nombresCombined.trim();
    }

    if (fullApe && fullNom) {
      if (fullNom.toLowerCase().includes(fullApe.toLowerCase())) {
        return fullNom.replace(/\s+/g, ' ').trim();
      }
      return `${fullApe} ${fullNom}`.replace(/\s+/g, ' ').trim();
    }

    if (fullApe) {
      if (fallbackFullName && !fullApe.toLowerCase().includes(fallbackFullName.toLowerCase())) {
        return `${fullApe} ${fallbackFullName}`.replace(/\s+/g, ' ').trim();
      }
      if (strictFullName) return strictFullName.replace(/\s+/g, ' ').trim();
      return fullApe;
    }

    if (fullNom) {
      if (strictFullName) return strictFullName.replace(/\s+/g, ' ').trim();
      return fullNom;
    }

    if (strictFullName) return strictFullName.replace(/\s+/g, ' ').trim();
    if (fallbackFullName) return fallbackFullName.replace(/\s+/g, ' ').trim();

    return '';
  }

  function extractFromRow(row, aliasList) {
    if (!row) return '';
    const rowKeys = Object.keys(row);

    // Pase 1: Coincidencia exacta
    for (const alias of aliasList) {
      const cleanAlias = cleanHeader(alias);
      for (const key of rowKeys) {
        const cleanKey = cleanHeader(key);
        if (cleanKey === cleanAlias) {
          const val = formatCellValue(row[key]);
          if (val !== '') return val;
        }
      }
    }

    // Pase 2: Coincidencia por inclusión segura
    for (const alias of aliasList) {
      const cleanAlias = cleanHeader(alias);
      for (const key of rowKeys) {
        const cleanKey = cleanHeader(key);

        // Guardas de seguridad estrictas:
        // NUNCA cruzar 'zona' con 'labor' u 'oficio'
        if (cleanAlias.includes('zona') && (cleanKey === 'labor' || cleanKey === 'labores' || cleanKey.includes('oficio'))) continue;
        if ((cleanAlias === 'labor' || cleanAlias === 'labores') && cleanKey.includes('zona')) continue;
        if (cleanAlias.includes('zona') && (cleanKey.includes('cuadrilla') || cleanKey.includes('encargado'))) continue;
        // NUNCA cruzar 'ruta' con 'vigente', 'periodo', 'contrato' o 'rut'
        if (cleanAlias === 'ruta' && (cleanKey.includes('vigente') || cleanKey.includes('periodo') || cleanKey.includes('contrato') || cleanKey.includes('rut'))) continue;

        if (cleanKey.includes(cleanAlias) || (cleanKey.length >= 4 && cleanAlias.includes(cleanKey))) {
          const val = formatCellValue(row[key]);
          if (val !== '') return val;
        }
      }
    }
    return '';
  }

  function extractValueForColumn(targetCol, row2, row1, keyCol1) {
    if (targetCol === 'Empresa') {
      let rawEmp = extractFromRow(row1, ['empresa', 'nombreempresa', 'razonsocial', 'compania', 'nom_empresa', 'idempresa']) ||
                   (row2 ? extractFromRow(row2, ['empresa', 'nombreempresa', 'razonsocial', 'compania', 'idempresa']) : '');
      if (rawEmp) {
        const cleanEmp = String(rawEmp).trim();
        if (EMPRESAS_MAP[cleanEmp]) return EMPRESAS_MAP[cleanEmp];
        return cleanEmp;
      }
      return 'SOCIEDAD EXPORTADORA VERFRUT S. A. C.';
    }

    if (targetCol === 'Apellidos y Nombres') {
      return getFullName(row1, row2);
    }

    if (targetCol === 'PLACA') {
      const estacionVal = extractFromRow(row2, ['nombreestacion', 'nombre_estacion', 'estacion', 'nomestacion', 'estaciontrabajo']) ||
                          extractFromRow(row1, ['nombreestacion', 'nombre_estacion', 'estacion', 'nomestacion']);
      if (estacionVal) return estacionVal;

      return extractFromRow(row2, ['placa', 'placavehiculo', 'vehiculo', 'placabus', 'movil']) ||
             extractFromRow(row1, ['placa', 'placavehiculo', 'vehiculo']);
    }

    if (targetCol === 'TURNO') {
      const rawHora = extractRawFromRow(row2, ['horainicio', 'hora_inicio', 'horaingreso', 'horarioinicio', 'horadeinicio', 'hora', 'horainic']) ||
                      extractRawFromRow(row1, ['horainicio', 'hora_inicio', 'horaingreso']);
      if (rawHora !== null && rawHora !== undefined && String(rawHora).trim() !== '') {
        return formatTimeValue(rawHora);
      }

      const rawTurno = extractRawFromRow(row2, ['turno', 'horario', 'jornada', 'tipoturno']) ||
                       extractRawFromRow(row1, ['turno', 'horario', 'jornada']);
      if (rawTurno !== null && rawTurno !== undefined && String(rawTurno).trim() !== '') {
        return formatTimeValue(rawTurno);
      }
      return '';
    }

    if (targetCol === 'HASTA') {
      const ultimoDiaVal = extractFromRow(row2, ['ultimodia', 'ultimo_dia', 'fechaultimodia', 'fecha_ultimo_dia', 'fecultdia', 'ultimodialaborado']) ||
                           extractFromRow(row1, ['ultimodia', 'ultimo_dia', 'fechaultimodia', 'fecha_ultimo_dia']);
      if (ultimoDiaVal) return ultimoDiaVal;

      return extractFromRow(row2, ['hasta', 'fechahasta', 'fecha_hasta', 'fec_hasta', 'vigenciahasta']) ||
             extractFromRow(row1, ['hasta', 'fechahasta', 'fecha_hasta']);
    }

    if (targetCol === 'Tiene Digitacion (jornal)') {
      return extractFromRow(row2, ['tienedigitacionjornal', 'tienedigitacion', 'digitacion', 'jornal', 'tienejornal', 'digitado', 'esjornal']) ||
             extractFromRow(row1, ['tienedigitacionjornal', 'tienedigitacion', 'digitacion', 'jornal', 'tienejornal', 'digitado', 'esjornal']);
    }

    if (targetCol === 'Zona Labores') {
      const act = row2 ? extractFromRow(row2, ['actividad', 'tipoactividad', 'motivo', 'situacion', 'labor', 'labores']) : '';
      const hasRegularLabor = act && !isAbsenceActivity(act);
      if (hasRegularLabor && row2) {
        return extractFromRow(row2, ['zona', 'zonalabores', 'zonadelabores', 'sede', 'fundo', 'campo', 'ubicacion', 'lugar', 'zonatrabajo']) ||
               extractFromRow(row1, ['zonalabores', 'zonadelabores', 'centrocostopredio', 'nombrezonatrab', 'zona', 'sede', 'fundo', 'campo']);
      }
      return extractFromRow(row1, ['zonalabores', 'zonadelabores', 'centrocostopredio', 'nombrezonatrab', 'zona', 'sede', 'fundo', 'campo']) ||
             (row2 ? extractFromRow(row2, ['zona', 'zonalabores', 'zonadelabores', 'sede', 'fundo', 'campo', 'ubicacion', 'lugar']) : '');
    }

    if (targetCol === 'SubCentroCosto / Cuartel') {
      const act = row2 ? extractFromRow(row2, ['actividad', 'tipoactividad', 'motivo', 'situacion', 'labor', 'labores']) : '';
      const hasRegularLabor = act && !isAbsenceActivity(act);
      if (hasRegularLabor && row2) {
        return extractFromRow(row2, ['cuartelsector', 'cuartel_sector', 'cuartel', 'sector', 'subcentrocostocuartel', 'subcentrocosto', 'centrocosto', 'centrodecosto', 'ceco', 'subceco', 'lote', 'valvula', 'nomcuartel', 'area', 'seccion']) ||
               extractFromRow(row1, ['subcentrocostocuartel', 'subcentrocosto', 'cuartel', 'centrocosto', 'centrodecosto', 'ceco', 'subceco', 'lote', 'valvula', 'nomcuartel']);
      }
      return extractFromRow(row1, ['subcentrocostocuartel', 'subcentrocosto', 'cuartel', 'centrocosto', 'centrodecosto', 'ceco', 'subceco', 'lote', 'valvula', 'nomcuartel']) ||
             (row2 ? extractFromRow(row2, ['cuartelsector', 'cuartel_sector', 'cuartel', 'sector', 'subcentrocostocuartel', 'subcentrocosto', 'centrocosto', 'ceco', 'lote']) : '');
    }

    const isPriorityFile2 = FILE2_PRIORITY_COLUMNS.includes(targetCol);
    const primaryRow = isPriorityFile2 ? row2 : row1;
    const secondaryRow = isPriorityFile2 ? row1 : row2;
    const aliases = COLUMN_ALIASES[targetCol] || [cleanHeader(targetCol)];

    let val = extractFromRow(primaryRow, aliases);
    if (!val) {
      val = extractFromRow(secondaryRow, aliases);
    }

    if ((targetCol === 'RutTrabajador' || targetCol === 'CodigoTrabajador') && !val && row1) {
      val = formatCellValue(row1[keyCol1]);
    }

    return val || '';
  }

  function isAbsenceActivity(text) {
    if (!text) return false;
    const clean = String(text).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return ABSENCE_KEYWORDS.some(kw => {
      const cleanKw = kw.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return clean.includes(cleanKw);
    });
  }

  // Parser de fechas flexible (soporta YYYY-MM-DD, DD/MM/YYYY, Date objects)
  function parseDateValue(val) {
    if (!val) return null;
    if (val instanceof Date && !isNaN(val.getTime())) return val;
    const str = String(val).trim();
    if (!str || str === '(en blanco)' || str === 'None' || str === 'null' || str === '-') return null;

    // Formato ISO: YYYY-MM-DD o YYYY-MM-DDTHH:mm:ss
    const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (isoMatch) {
      return new Date(parseInt(isoMatch[1], 10), parseInt(isoMatch[2], 10) - 1, parseInt(isoMatch[3], 10));
    }

    // Formato Latino: DD/MM/YYYY
    const latMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (latMatch) {
      return new Date(parseInt(latMatch[3], 10), parseInt(latMatch[2], 10) - 1, parseInt(latMatch[1], 10));
    }

    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }

  // Obtiene la fecha de referencia para el cálculo de días de labor
  function getReferenceDate() {
    let refDate = null;
    if (elements.sqlParam3Fecha && elements.sqlParam3Fecha.value) {
      const raw = elements.sqlParam3Fecha.value.trim();
      refDate = parseDateValue(raw);
    }
    if (!refDate || isNaN(refDate.getTime())) {
      let maxTimestamp = 0;
      if (state.file2.data && state.file2.data.length > 0) {
        state.file2.data.slice(0, 200).forEach(r => {
          const dVal = extractRawFromRow(r, ['ultimodia', 'ultimo_dia', 'fechaultimodia', 'hasta', 'fechahasta']);
          const parsed = parseDateValue(dVal);
          if (parsed && parsed.getTime() > maxTimestamp && parsed.getFullYear() > 2000 && parsed.getFullYear() < 2100) {
            maxTimestamp = parsed.getTime();
          }
        });
      }
      if (maxTimestamp > 0) {
        refDate = new Date(maxTimestamp);
      } else {
        refDate = new Date();
      }
    }
    return refDate;
  }

  // Initialize
  function init() {
    initTheme();
    setupEventListeners();
    setupDropzones();
    setupCardConfigToggles();
    setupColumnVisibilityMenu();
    checkSqlConnection();
  }

  // Theme Management
  function initTheme() {
    const savedTheme = localStorage.getItem('rrhh_theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(savedTheme);

    if (elements.btnThemeToggle) {
      elements.btnThemeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
        setTheme(nextTheme);
      });
    }
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('rrhh_theme', theme);
  }

  // Check SQL Server Connection Status
  async function checkSqlConnection() {
    if (!elements.dbStatusBadge) return;
    try {
      const resp = await fetch('/api/test-sql');
      const data = await resp.json();
      if (data.success) {
        elements.dbStatusBadge.innerHTML = '<span class="db-dot"></span> SQL Server Conectado';
        elements.dbStatusBadge.classList.remove('disconnected');
      } else {
        elements.dbStatusBadge.innerHTML = '<span class="db-dot" style="background-color: var(--danger-500); box-shadow: 0 0 6px var(--danger-500);"></span> SQL Desconectado';
        elements.dbStatusBadge.classList.add('disconnected');
      }
    } catch (e) {
      if (elements.dbStatusBadge) {
        elements.dbStatusBadge.innerHTML = '<span class="db-dot" style="background-color: var(--warning-500); box-shadow: 0 0 6px var(--warning-500);"></span> Modo Local';
      }
    }
  }

  // Load Workers Directly from SQL Server (Archivo 1)
  async function loadFromSqlServer(customParams = null) {
    const btn1 = elements.btnLoadSql;
    const btnHeader = elements.btnLoadSqlHeader;

    try {
      if (btn1) {
        btn1.disabled = true;
        btn1.innerHTML = '<svg class="btn-icon process-spin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> <span>Consultando SQL...</span>';
      }
      if (btnHeader) {
        btnHeader.disabled = true;
        btnHeader.innerHTML = '<svg class="btn-icon process-spin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> <span>Consultando...</span>';
      }

      showToast('Conectando a base de datos vfstbd01 y consultando trabajadores...', 'info');

      const p = customParams || {
        idEmpresa: elements.sqlParamEmpresa ? elements.sqlParamEmpresa.value : '14',
        activo: elements.sqlParamActivo ? elements.sqlParamActivo.value : '1',
        mes: elements.sqlParamMes ? elements.sqlParamMes.value : '8',
        anio: elements.sqlParamAnio ? elements.sqlParamAnio.value : '2026',
        fechaini: elements.sqlParamFechaini ? elements.sqlParamFechaini.value : '31/8/2026'
      };

      const queryParams = new URLSearchParams(p);
      const response = await fetch(`/api/trabajadores?${queryParams.toString()}`);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Error del servidor HTTP ${response.status}`);
      }

      const result = await response.json();
      if (!result.success || !result.data || result.data.length === 0) {
        throw new Error(result.error || 'No se obtuvieron registros de trabajadores desde la base de datos.');
      }

      state.file1 = {
        data: result.data,
        name: `SQL Server (bsis_rem_afr) - Mes ${result.params.mes}/${result.params.anio}`,
        headers: result.headers,
        keyCol: 'RutTrabajador',
        patCol: 'Ap.Paterno',
        matCol: 'Ap. Materno',
        nomCol: 'Nombre',
        sheetNames: ['SQL_Result'],
        selectedSheet: 'SQL_Result'
      };

      autoDetectColumns(1);
      updateFileCardUI(1, {
        name: `SQL Server (bsis_rem_afr) - ${result.count.toLocaleString()} trab.`,
        size: result.count * 150
      }, result.count);
      checkProcessingReadiness();

      closeModal(elements.modalSqlParams);
      showToast(`¡${result.count.toLocaleString()} trabajadores cargados directamente desde SQL Server!`, 'success');
      return result;
    } catch (err) {
      console.error(err);
      showToast(`Error al consultar SQL Server: ${err.message}`, 'error');
      throw err;
    } finally {
      if (btn1) {
        btn1.disabled = false;
        btn1.innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg> <span>Cargar desde SQL Server</span>';
      }
      if (btnHeader) {
        btnHeader.disabled = false;
        btnHeader.innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg> <span>Sincronizar SQL</span>';
      }
    }
  }

  // Load Último Día & Labores from SQL Server (Archivo 2)
  async function loadUltimoDiaFromSqlServer(customParams = null) {
    const btn2 = elements.btnLoadSql2;

    try {
      if (btn2) {
        btn2.disabled = true;
        btn2.innerHTML = '<svg class="btn-icon process-spin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> <span>Consultando Labores...</span>';
      }

      showToast('Consultando último día y labores en vfstbd01...', 'info');

      const p = customParams || {
        idEmpresa: elements.sqlParam2Empresa ? elements.sqlParam2Empresa.value : '14',
        mes: elements.sqlParam2Mes ? elements.sqlParam2Mes.value : '8',
        anio: elements.sqlParam2Anio ? elements.sqlParam2Anio.value : '2026'
      };

      const queryParams = new URLSearchParams(p);
      const response = await fetch(`/api/ultimo-dia?${queryParams.toString()}`);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Error del servidor HTTP ${response.status}`);
      }

      const result = await response.json();
      if (!result.success || !result.data || result.data.length === 0) {
        throw new Error(result.error || 'No se obtuvieron registros de labores / último día.');
      }

      state.file2 = {
        data: result.data,
        name: `SQL Server (Labores/Último Día) - Mes ${result.params.mes}/${result.params.anio}`,
        headers: result.headers,
        keyCol: 'RUT/DNI',
        actCol: 'ACTIVIDAD',
        laborCol: 'LABOR',
        turnoCol: 'HoraInicio',
        cuadrillaCol: 'IdCuadrilla',
        sheetNames: ['SQL_Result'],
        selectedSheet: 'SQL_Result'
      };

      autoDetectColumns(2);
      updateFileCardUI(2, {
        name: `SQL Server (Labores) - ${result.count.toLocaleString()} reg.`,
        size: result.count * 120
      }, result.count);
      checkProcessingReadiness();

      closeModal(elements.modalSqlParams2);
      showToast(`¡${result.count.toLocaleString()} registros de labores cargados desde SQL Server!`, 'success');
      return result;
    } catch (err) {
      console.error(err);
      showToast(`Error al consultar Labores/Último Día: ${err.message}`, 'error');
      throw err;
    } finally {
      if (btn2) {
        btn2.disabled = false;
        btn2.innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg> <span>Cargar desde SQL Server</span>';
      }
    }
  }

  // Load Buses from SQL Server (Archivo 4)
  async function loadBusesFromSqlServer() {
    const btn4 = elements.btnLoadSql4;
    try {
      if (btn4) {
        btn4.disabled = true;
        btn4.innerHTML = '<svg class="btn-icon process-spin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> <span>Cargando...</span>';
      }

      const response = await fetch('/api/buses?idEmpresa=14');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      if (!result.success || !result.data) throw new Error(result.error || 'Error al obtener buses');

      state.file4 = {
        data: result.data,
        name: `SQL Server (Buses) - ${result.count} buses`,
        headers: result.headers,
        patenteCol: 'Patente',
        codBusCol: 'Codigo Campo',
        rutaCol: 'Descripcion Ruta',
        sheetNames: ['SQL_Result'],
        selectedSheet: 'SQL_Result'
      };

      autoDetectColumns(4);
      updateFileCardUI(4, { name: `SQL Server (Buses) - ${result.count} buses`, size: result.count * 80 }, result.count);
      showToast(`¡${result.count} buses cargados desde SQL Server!`, 'success');
      return result;
    } catch (err) {
      console.error(err);
      showToast(`Error al consultar Buses: ${err.message}`, 'error');
    } finally {
      if (btn4) {
        btn4.disabled = false;
        btn4.innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg> <span>Cargar desde SQL Server</span>';
      }
    }
  }

  // Load Cuadrillas from SQL Server (Archivo 5)
  async function loadCuadrillasFromSqlServer() {
    const btn5 = elements.btnLoadSql5;
    try {
      if (btn5) {
        btn5.disabled = true;
        btn5.innerHTML = '<svg class="btn-icon process-spin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> <span>Cargando...</span>';
      }

      const response = await fetch('/api/cuadrillas?idEmpresa=14');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      if (!result.success || !result.data) throw new Error(result.error || 'Error al obtener cuadrillas');

      state.file5 = {
        data: result.data,
        name: `SQL Server (Cuadrillas) - ${result.count} cuadrillas`,
        headers: result.headers,
        idCuadrillaCol: 'IDCUADRILLA',
        descCol: 'Descripcion',
        nombreEncargadoCol: 'Nombre Encargado',
        sheetNames: ['SQL_Result'],
        selectedSheet: 'SQL_Result'
      };

      autoDetectColumns(5);
      updateFileCardUI(5, { name: `SQL Server (Cuadrillas) - ${result.count} cuadrillas`, size: result.count * 80 }, result.count);
      showToast(`¡${result.count} cuadrillas cargadas desde SQL Server!`, 'success');
      return result;
    } catch (err) {
      console.error(err);
      showToast(`Error al consultar Cuadrillas: ${err.message}`, 'error');
    } finally {
      if (btn5) {
        btn5.disabled = false;
        btn5.innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg> <span>Cargar desde SQL Server</span>';
      }
    }
  }

  // Load Marcaciones from SQL Server (Archivo 3 - SPC_LOGIN_MARCACIONES)
  async function loadMarcacionesFromSqlServer(customParams = null) {
    const btn3 = elements.btnLoadSql3;

    try {
      if (btn3) {
        btn3.disabled = true;
        btn3.innerHTML = '<svg class="btn-icon process-spin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> <span>Consultando Marcaciones...</span>';
      }

      showToast('Consultando marcaciones biométricas en vfstbd01 (SPC_LOGIN_MARCACIONES)...', 'info');

      const p = customParams || {
        fecha: elements.sqlParam3Fecha ? elements.sqlParam3Fecha.value : '19/8/2026',
        dias: elements.sqlParam3Dias ? elements.sqlParam3Dias.value : '3',
        idEmpresa: elements.sqlParam3Empresa ? elements.sqlParam3Empresa.value : '14',
        sw_contrato: elements.sqlParam3Sw ? elements.sqlParam3Sw.value : '0'
      };

      const queryParams = new URLSearchParams(p);
      const response = await fetch(`/api/marcaciones?${queryParams.toString()}`);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Error del servidor HTTP ${response.status}`);
      }

      const result = await response.json();
      if (!result.success || !result.data || result.data.length === 0) {
        throw new Error(result.error || 'No se obtuvieron registros de marcaciones.');
      }

      state.file3 = {
        data: result.data,
        name: `SQL Server (Marcaciones) - ${result.params.fecha} (${result.params.dias} días)`,
        headers: result.headers,
        keyCol: 'RutTrabajador',
        nomEstCol: 'NOMBRE_ESTACION',
        tipoEstCol: 'TIPO_ESTACION',
        sheetNames: ['SQL_Result'],
        selectedSheet: 'SQL_Result'
      };

      autoDetectColumns(3);
      updateFileCardUI(3, {
        name: `SQL Server (Marcaciones) - ${result.count.toLocaleString()} marc.`,
        size: result.count * 110
      }, result.count);
      checkProcessingReadiness();

      closeModal(elements.modalSqlParams3);
      showToast(`¡${result.count.toLocaleString()} marcaciones cargadas desde SQL Server (${result.params.dias} días)!`, 'success');
      return result;
    } catch (err) {
      console.error(err);
      showToast(`Error al consultar Marcaciones: ${err.message}`, 'error');
      throw err;
    } finally {
      if (btn3) {
        btn3.disabled = false;
        btn3.innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg> <span>Cargar desde SQL Server (3 días)</span>';
      }
    }
  }

  // Load All Sources from SQL Server in Parallel (5 Fuentes)
  async function loadAllFromSqlServer() {
    const btnAll = elements.btnLoadAllSql;
    if (btnAll) {
      btnAll.disabled = true;
      btnAll.innerHTML = '<svg class="btn-icon process-spin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> <span>Sincronizando 5 Fuentes...</span>';
    }

    showToast('Iniciando sincronización completa de las 5 fuentes desde SQL Server...', 'info');

    const results = await Promise.allSettled([
      loadFromSqlServer(),
      loadUltimoDiaFromSqlServer(),
      loadMarcacionesFromSqlServer(),
      loadBusesFromSqlServer(),
      loadCuadrillasFromSqlServer()
    ]);

    if (btnAll) {
      btnAll.disabled = false;
      btnAll.innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg> <span>⚡ Sincronizar Todo (SQL)</span>';
    }

    const successful = results.filter(r => r.status === 'fulfilled').length;
    if (successful >= 3) {
      showToast('🎉 ¡Las fuentes de datos fueron sincronizadas desde SQL Server! Puedes hacer clic en "Procesar y Consolidar".', 'success');
    }
  }

  // Setup Event Listeners
  function setupEventListeners() {
    elements.btnProcess.addEventListener('click', handleProcessData);
    elements.btnExportExcel.addEventListener('click', () => exportData('xlsx'));
    elements.btnExportCsv.addEventListener('click', () => exportData('csv'));
    elements.btnCopyTable.addEventListener('click', copyTableToClipboard);
    elements.btnPrintTable.addEventListener('click', () => window.print());
    elements.btnLoadDemo.addEventListener('click', loadDemoData);
    elements.btnResetAll.addEventListener('click', resetAll);

    // Modals
    elements.btnHelp.addEventListener('click', () => openModal(elements.modalHelp));
    elements.btnCloseModal.addEventListener('click', () => closeModal(elements.modalHelp));
    elements.btnShortcuts.addEventListener('click', () => openModal(elements.modalShortcuts));
    elements.btnCloseShortcuts.addEventListener('click', () => closeModal(elements.modalShortcuts));
    elements.btnClosePreview.addEventListener('click', () => closeModal(elements.modalPreview));
    elements.btnCloseDossier.addEventListener('click', () => closeModal(elements.modalDossier));

    // SQL Server Modal & Action Events
    if (elements.btnLoadAllSql) {
      elements.btnLoadAllSql.addEventListener('click', () => loadAllFromSqlServer());
    }
    if (elements.btnLoadSql) {
      elements.btnLoadSql.addEventListener('click', () => loadFromSqlServer());
    }
    if (elements.btnLoadSqlHeader) {
      elements.btnLoadSqlHeader.addEventListener('click', () => loadFromSqlServer());
    }
    if (elements.btnOpenSqlParams) {
      elements.btnOpenSqlParams.addEventListener('click', () => openModal(elements.modalSqlParams));
    }
    if (elements.btnCloseSqlParams) {
      elements.btnCloseSqlParams.addEventListener('click', () => closeModal(elements.modalSqlParams));
    }
    if (elements.btnCancelSqlParams) {
      elements.btnCancelSqlParams.addEventListener('click', () => closeModal(elements.modalSqlParams));
    }
    if (elements.formSqlParams) {
      elements.formSqlParams.addEventListener('submit', (e) => {
        e.preventDefault();
        const customParams = {
          idEmpresa: elements.sqlParamEmpresa ? elements.sqlParamEmpresa.value : '14',
          activo: elements.sqlParamActivo ? elements.sqlParamActivo.value : '1',
          mes: elements.sqlParamMes ? elements.sqlParamMes.value : '8',
          anio: elements.sqlParamAnio ? elements.sqlParamAnio.value : '2026',
          fechaini: elements.sqlParamFechaini ? elements.sqlParamFechaini.value : '31/8/2026'
        };
        loadFromSqlServer(customParams);
      });
    }

    // Card 2 SQL Events (Último Día)
    if (elements.btnLoadSql2) {
      elements.btnLoadSql2.addEventListener('click', () => loadUltimoDiaFromSqlServer());
    }
    if (elements.btnOpenSqlParams2) {
      elements.btnOpenSqlParams2.addEventListener('click', () => openModal(elements.modalSqlParams2));
    }
    if (elements.btnCloseSqlParams2) {
      elements.btnCloseSqlParams2.addEventListener('click', () => closeModal(elements.modalSqlParams2));
    }
    if (elements.btnCancelSqlParams2) {
      elements.btnCancelSqlParams2.addEventListener('click', () => closeModal(elements.modalSqlParams2));
    }
    if (elements.formSqlParams2) {
      elements.formSqlParams2.addEventListener('submit', (e) => {
        e.preventDefault();
        const customParams = {
          idEmpresa: elements.sqlParam2Empresa ? elements.sqlParam2Empresa.value : '14',
          mes: elements.sqlParam2Mes ? elements.sqlParam2Mes.value : '8',
          anio: elements.sqlParam2Anio ? elements.sqlParam2Anio.value : '2026'
        };
        loadUltimoDiaFromSqlServer(customParams);
      });
    }

    // Card 3 SQL Events (Marcaciones - SPC_LOGIN_MARCACIONES)
    if (elements.btnLoadSql3) {
      elements.btnLoadSql3.addEventListener('click', () => loadMarcacionesFromSqlServer());
    }
    if (elements.btnOpenSqlParams3) {
      elements.btnOpenSqlParams3.addEventListener('click', () => openModal(elements.modalSqlParams3));
    }
    if (elements.btnCloseSqlParams3) {
      elements.btnCloseSqlParams3.addEventListener('click', () => closeModal(elements.modalSqlParams3));
    }
    if (elements.btnCancelSqlParams3) {
      elements.btnCancelSqlParams3.addEventListener('click', () => closeModal(elements.modalSqlParams3));
    }
    if (elements.formSqlParams3) {
      elements.formSqlParams3.addEventListener('submit', (e) => {
        e.preventDefault();
        const customParams = {
          fecha: elements.sqlParam3Fecha ? elements.sqlParam3Fecha.value : '19/8/2026',
          dias: elements.sqlParam3Dias ? elements.sqlParam3Dias.value : '3',
          idEmpresa: elements.sqlParam3Empresa ? elements.sqlParam3Empresa.value : '14',
          sw_contrato: elements.sqlParam3Sw ? elements.sqlParam3Sw.value : '0'
        };
        loadMarcacionesFromSqlServer(customParams);
      });
    }

    // Cards 4 & 5 SQL Events (Buses & Cuadrillas)
    if (elements.btnLoadSql4) {
      elements.btnLoadSql4.addEventListener('click', () => loadBusesFromSqlServer());
    }
    if (elements.btnLoadSql5) {
      elements.btnLoadSql5.addEventListener('click', () => loadCuadrillasFromSqlServer());
    }

    [elements.modalHelp, elements.modalShortcuts, elements.modalPreview, elements.modalDossier, elements.modalSqlParams, elements.modalSqlParams2, elements.modalSqlParams3].forEach(modal => {
      if (!modal) return;
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal(modal);
      });
    });

    // Search & Filter
    elements.tableSearch.addEventListener('input', (e) => {
      state.searchTerm = e.target.value.toLowerCase().trim();
      elements.btnClearSearch.classList.toggle('visible', state.searchTerm.length > 0);
      state.currentPage = 1;
      applyFilters();
    });

    elements.btnClearSearch.addEventListener('click', () => {
      elements.tableSearch.value = '';
      state.searchTerm = '';
      elements.btnClearSearch.classList.remove('visible');
      state.currentPage = 1;
      applyFilters();
    });

    // Filter Chips
    elements.filterChips.forEach(chip => {
      chip.addEventListener('click', () => {
        elements.filterChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.activeFilter = chip.dataset.filter;
        state.currentPage = 1;
        applyFilters();
      });
    });

    // Interactive KPI Cards (Click to filter)
    document.querySelectorAll('.metric-interactive').forEach(card => {
      card.addEventListener('click', () => {
        const targetFilter = card.dataset.filterTarget;
        if (!targetFilter) return;
        const matchingChip = document.querySelector(`.filter-chip[data-filter="${targetFilter}"]`);
        if (matchingChip) matchingChip.click();
      });
    });

    // Page Size Selector
    elements.selectPageSize.addEventListener('change', (e) => {
      state.pageSize = parseInt(e.target.value, 10);
      state.currentPage = 1;
      renderTable();
    });

    // Pagination Buttons
    elements.btnFirstPage.addEventListener('click', () => {
      state.currentPage = 1;
      renderTable();
    });
    elements.btnPrevPage.addEventListener('click', () => {
      if (state.currentPage > 1) {
        state.currentPage--;
        renderTable();
      }
    });
    elements.btnNextPage.addEventListener('click', () => {
      const maxPage = Math.ceil(state.filteredData.length / state.pageSize) || 1;
      if (state.currentPage < maxPage) {
        state.currentPage++;
        renderTable();
      }
    });
    elements.btnLastPage.addEventListener('click', () => {
      const maxPage = Math.ceil(state.filteredData.length / state.pageSize) || 1;
      state.currentPage = maxPage;
      renderTable();
    });

    // Global Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!elements.btnProcess.disabled) elements.btnProcess.click();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        elements.tableSearch.focus();
        elements.tableSearch.select();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        elements.btnLoadDemo.click();
      } else if (e.key === 'Escape') {
        closeAllModals();
        if (document.activeElement === elements.tableSearch) {
          elements.tableSearch.blur();
        }
      }
    });
  }

  function openModal(modal) {
    if (modal) modal.classList.add('active');
  }

  function closeModal(modal) {
    if (modal) modal.classList.remove('active');
  }

  function closeAllModals() {
    document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
    if (elements.columnsDropdownMenu) elements.columnsDropdownMenu.classList.remove('active');
  }

  // Setup Collapsible Card Configuration
  function setupCardConfigToggles() {
    for (let i = 1; i <= 5; i++) {
      const toggleBtn = document.getElementById(`toggle-config-${i}`);
      const configDiv = document.getElementById(`card-config-${i}`);
      if (toggleBtn && configDiv) {
        toggleBtn.addEventListener('click', () => {
          const isExpanded = configDiv.classList.toggle('expanded');
          toggleBtn.setAttribute('aria-expanded', isExpanded);
        });
      }
    }
  }

  // Setup Column Visibility Dropdown & Presets
  function setupColumnVisibilityMenu() {
    if (!elements.btnToggleColumns || !elements.columnsDropdownMenu) return;

    elements.btnToggleColumns.addEventListener('click', (e) => {
      e.stopPropagation();
      elements.columnsDropdownMenu.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
      if (!elements.columnsDropdownMenu.contains(e.target) && e.target !== elements.btnToggleColumns) {
        elements.columnsDropdownMenu.classList.remove('active');
      }
    });

    // Populate checkboxes
    elements.columnsCheckboxList.innerHTML = '';
    TARGET_COLUMNS.forEach(col => {
      const label = document.createElement('label');
      label.className = 'col-checkbox-label';
      label.innerHTML = `
        <input type="checkbox" value="${col}" ${state.visibleColumns.has(col) ? 'checked' : ''}>
        <span>${col}</span>
      `;
      const input = label.querySelector('input');
      input.addEventListener('change', () => {
        if (input.checked) {
          state.visibleColumns.add(col);
        } else {
          if (state.visibleColumns.size > 1) {
            state.visibleColumns.delete(col);
          } else {
            input.checked = true;
            showToast('Debe haber al menos una columna visible', 'info');
          }
        }
        renderTableHeader();
        renderTable();
      });
      elements.columnsCheckboxList.appendChild(label);
    });

    // Column Presets
    document.querySelectorAll('.btn-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const preset = btn.dataset.preset;
        if (preset === 'all') {
          state.visibleColumns = new Set(TARGET_COLUMNS);
        } else if (preset === 'summary') {
          state.visibleColumns = new Set(['Empresa', 'RutTrabajador', 'CodigoTrabajador', 'Apellidos y Nombres', 'Oficio', 'Zona Labores', 'ACTIVIDAD', 'LABOR', 'ESTADO']);
        } else if (preset === 'attendance') {
          state.visibleColumns = new Set(['Empresa', 'RutTrabajador', 'Apellidos y Nombres', 'Tiene Digitacion (jornal)', 'PLACA', 'TURNO', 'ACTIVIDAD', 'ESTADO']);
        } else if (preset === 'transport') {
          state.visibleColumns = new Set(['Empresa', 'RutTrabajador', 'Apellidos y Nombres', 'Zona Labores', 'ENCARGADO', 'PLACA', 'CODIGO BUS', 'RUTA', 'TURNO', 'ESTADO']);
        }

        // Update checkboxes
        elements.columnsCheckboxList.querySelectorAll('input[type="checkbox"]').forEach(inp => {
          inp.checked = state.visibleColumns.has(inp.value);
        });

        renderTableHeader();
        renderTable();
      });
    });
  }

  // Setup Drag and Drop
  function setupDropzones() {
    setupSingleDropzone(elements.dropzone1, elements.fileInput1, 1);
    setupSingleDropzone(elements.dropzone2, elements.fileInput2, 2);
    setupSingleDropzone(elements.dropzone3, elements.fileInput3, 3);
    setupSingleDropzone(elements.dropzone4, elements.fileInput4, 4);
    setupSingleDropzone(elements.dropzone5, elements.fileInput5, 5);

    // Setup preview buttons
    document.querySelectorAll('.btn-preview-file').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const fileIdx = parseInt(btn.dataset.fileIndex, 10);
        showFilePreview(fileIdx);
      });
    });
  }

  function setupSingleDropzone(zone, input, fileIndex) {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      zone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
      e.preventDefault();
      e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
      zone.addEventListener(eventName, () => zone.classList.add('dragover'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      zone.addEventListener(eventName, () => zone.classList.remove('dragover'), false);
    });

    zone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;
      if (files && files.length > 0) {
        handleFileSelected(files[0], fileIndex);
      }
    });

    input.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFileSelected(e.target.files[0], fileIndex);
      }
    });
  }

  // Parser inteligente de hojas Excel
  function parseWorkbookSheet(sheet) {
    if (!sheet) return { data: [], headers: [] };

    const rawMatrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
    if (!rawMatrix || rawMatrix.length === 0) {
      return { data: [], headers: [] };
    }

    let headerRowIndex = 0;
    let maxScore = 0;

    const HEADER_KEYWORDS = [
      'dni', 'rut', 'documento', 'codigo', 'cod', 'paterno', 'materno', 'apellido',
      'nombre', 'nombres', 'trabajador', 'colaborador', 'empleado', 'oficio', 'cargo',
      'actividad', 'labor', 'zona', 'cuartel', 'turno', 'estacion', 'placa', 'marcacion',
      'regimen', 'nacimiento', 'sexo', 'edad', 'contrato', 'hasta', 'jornal'
    ];

    for (let i = 0; i < Math.min(15, rawMatrix.length); i++) {
      const row = rawMatrix[i];
      if (!Array.isArray(row) || row.length === 0) continue;

      let score = 0;
      let validCells = 0;

      row.forEach(cell => {
        if (cell !== undefined && cell !== null && String(cell).trim() !== '') {
          validCells++;
          const clean = cleanHeader(cell);
          if (HEADER_KEYWORDS.some(kw => clean.includes(kw) || kw.includes(clean))) {
            score += 3;
          }
        }
      });

      if (validCells >= 2 && score > maxScore) {
        maxScore = score;
        headerRowIndex = i;
      }
    }

    const headerRow = rawMatrix[headerRowIndex] || [];
    const headers = [];
    const usedHeaders = new Set();

    headerRow.forEach((cell, idx) => {
      let h = String(cell !== undefined && cell !== null ? cell : '').trim();
      if (!h || h.startsWith('__EMPTY')) {
        h = `Columna_${idx + 1}`;
      }
      let uniqueH = h;
      let counter = 2;
      while (usedHeaders.has(uniqueH)) {
        uniqueH = `${h}_${counter}`;
        counter++;
      }
      usedHeaders.add(uniqueH);
      headers.push(uniqueH);
    });

    const data = [];
    for (let r = headerRowIndex + 1; r < rawMatrix.length; r++) {
      const rowData = rawMatrix[r];
      if (!rowData || !Array.isArray(rowData)) continue;
      
      const hasContent = rowData.some(c => c !== undefined && c !== null && String(c).trim() !== '');
      if (!hasContent) continue;

      const obj = {};
      headers.forEach((h, colIdx) => {
        obj[h] = rowData[colIdx] !== undefined ? rowData[colIdx] : '';
      });
      data.push(obj);
    }

    return { data, headers };
  }

  // Handle File Selection
  function handleFileSelected(file, fileIndex) {
    const validExtensions = ['.xlsx', '.xls', '.csv'];
    const fileName = file.name;
    const fileExt = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();

    if (!validExtensions.includes(fileExt)) {
      showToast('Formato no válido. Sube archivos .xlsx, .xls o .csv', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true, dateNF: 'yyyy-mm-dd' });

        const fileKey = `file${fileIndex}`;
        state[fileKey].workbook = workbook;
        state[fileKey].name = fileName;
        state[fileKey].fileObj = file;
        state[fileKey].sheetNames = workbook.SheetNames || [];

        let bestSheetName = workbook.SheetNames[0];
        let bestRowCount = -1;

        workbook.SheetNames.forEach(sName => {
          const s = workbook.Sheets[sName];
          const parsed = parseWorkbookSheet(s);
          if (parsed.data.length > bestRowCount) {
            bestRowCount = parsed.data.length;
            bestSheetName = sName;
          }
        });

        loadSheetData(fileIndex, bestSheetName, file);
      } catch (err) {
        console.error(err);
        showToast(`Error al leer ${fileName}: ${err.message}`, 'error');
      }
    };

    reader.readAsArrayBuffer(file);
  }

  function loadSheetData(fileIndex, sheetName, file) {
    const fileKey = `file${fileIndex}`;
    const workbook = state[fileKey].workbook;
    if (!workbook) return;

    const sheet = workbook.Sheets[sheetName];
    const parsed = parseWorkbookSheet(sheet);
    const rawJson = parsed.data;
    const headers = parsed.headers;

    if (!rawJson || rawJson.length === 0) {
      showToast(`La hoja "${sheetName}" no contiene filas válidas`, 'error');
      return;
    }

    state[fileKey].selectedSheet = sheetName;
    state[fileKey].data = rawJson;
    state[fileKey].headers = headers;

    autoDetectColumns(fileIndex);
    updateFileCardUI(fileIndex, file || state[fileKey].fileObj || { name: state[fileKey].name, size: 0 }, rawJson.length);
    checkProcessingReadiness();
    showToast(`Archivo ${fileIndex} cargado (${sheetName}): ${rawJson.length.toLocaleString()} filas`, 'success');
  }

  // Auto-detect columns
  function autoDetectColumns(fileIndex) {
    const fileKey = `file${fileIndex}`;
    const headers = state[fileKey].headers;

    let detectedKey = headers[0];
    for (const h of headers) {
      const cleanH = cleanHeader(h);
      if (ID_KEYWORDS.some(keyword => cleanH === keyword || cleanH.includes(keyword))) {
        detectedKey = h;
        break;
      }
    }
    state[fileKey].keyCol = detectedKey;

    if (fileIndex === 1) {
      let detectedPat = '', detectedMat = '', detectedNom = '';
      for (const h of headers) {
        if (isPaternoHeader(h)) { detectedPat = h; break; }
      }
      for (const h of headers) {
        if (isMaternoHeader(h)) { detectedMat = h; break; }
      }
      for (const h of headers) {
        if (isNombresHeader(h)) { detectedNom = h; break; }
      }
      state.file1.patCol = detectedPat;
      state.file1.matCol = detectedMat;
      state.file1.nomCol = detectedNom;
    }

    if (fileIndex === 2) {
      let detectedAct = '', detectedLabor = '', detectedTurno = '', detectedCuadrilla = '';
      for (const h of headers) {
        const cleanH = cleanHeader(h);
        if (cleanH === 'actividad' || ACTIVITY_KEYWORDS.some(kw => cleanH === kw || cleanH.includes(kw))) {
          detectedAct = h;
          break;
        }
      }
      for (const h of headers) {
        const cleanH = cleanHeader(h);
        if (cleanH === 'labor' || cleanH === 'labores' || LABOR_KEYWORDS.some(kw => cleanH === kw || cleanH.includes(kw))) {
          detectedLabor = h;
          break;
        }
      }
      for (const h of headers) {
        const cleanH = cleanHeader(h);
        if (cleanH === 'horainicio' || cleanH.includes('horainicio') || cleanH.includes('horadeinicio') || cleanH.includes('horaingreso') || cleanH === 'turno' || cleanH.includes('turno') || cleanH === 'hora') {
          detectedTurno = h;
          break;
        }
      }
      for (const h of headers) {
        const cleanH = cleanHeader(h);
        if (cleanH === 'idcuadrilla' || cleanH.includes('idcuadrilla') || cleanH === 'cuadrilla' || cleanH.includes('cuadrilla')) {
          detectedCuadrilla = h;
          break;
        }
      }
      state.file2.actCol = detectedAct || (headers.length > 1 ? headers[1] : headers[0]);
      state.file2.laborCol = detectedLabor || (headers.length > 2 ? headers[2] : headers[0]);
      state.file2.turnoCol = detectedTurno || '';
      state.file2.cuadrillaCol = detectedCuadrilla || '';
    }

    if (fileIndex === 3) {
      let detectedNomEst = '', detectedTipoEst = '';
      for (const h of headers) {
        const cleanH = cleanHeader(h);
        if (cleanH.includes('nombreestacion') || cleanH === 'estacion' || cleanH.includes('nomest') || cleanH.includes('placa')) {
          detectedNomEst = h;
          break;
        }
      }
      for (const h of headers) {
        const cleanH = cleanHeader(h);
        if (cleanH.includes('tipoestacion') || cleanH === 'tipo' || cleanH.includes('tipoest')) {
          detectedTipoEst = h;
          break;
        }
      }
      state.file3.nomEstCol = detectedNomEst;
      state.file3.tipoEstCol = detectedTipoEst;
    }

    if (fileIndex === 4) {
      let detectedPatente = '', detectedCodBus = '', detectedRuta = '';
      for (const h of headers) {
        const cleanH = cleanHeader(h);
        if (cleanH === 'patente' || cleanH.includes('patente') || cleanH === 'placa' || cleanH.includes('placa') || cleanH.includes('vehiculo') || cleanH === 'unidad') {
          detectedPatente = h;
          break;
        }
      }
      for (const h of headers) {
        const cleanH = cleanHeader(h);
        if (cleanH === 'codigocampo' || cleanH.includes('codigocampo') || cleanH === 'codbus' || cleanH.includes('codbus') || cleanH === 'codigobus' || cleanH.includes('codigobus') || cleanH === 'tipobus' || cleanH.includes('tipobus') || cleanH.includes('tipo_bus') || cleanH.includes('codcampo') || cleanH === 'nrobus') {
          detectedCodBus = h;
          break;
        }
      }
      for (const h of headers) {
        const cleanH = cleanHeader(h);
        if (cleanH === 'descripcionruta' || cleanH.includes('descripcionruta') || cleanH === 'ruta' || cleanH.includes('ruta') || cleanH.includes('recorrido') || cleanH.includes('linea') || cleanH.includes('origen') || cleanH.includes('destino')) {
          detectedRuta = h;
          break;
        }
      }
      state.file4.patenteCol = detectedPatente || headers[0];
      state.file4.codBusCol = detectedCodBus || '';
      state.file4.rutaCol = detectedRuta || '';
    }

    if (fileIndex === 5) {
      let detectedIdCuad = '', detectedDesc = '', detectedNomEnc = '';
      for (const h of headers) {
        const cleanH = cleanHeader(h);
        if (cleanH === 'idcuadrilla' || cleanH.includes('idcuadrilla')) { detectedIdCuad = h; break; }
      }
      for (const h of headers) {
        const cleanH = cleanHeader(h);
        if (cleanH === 'descripcion' || cleanH.includes('descripcion') || cleanH === 'nombrecuadrilla' || cleanH.includes('desccuadrilla')) { detectedDesc = h; break; }
      }
      for (const h of headers) {
        const cleanH = cleanHeader(h);
        if (cleanH === 'nombreencargado' || cleanH.includes('nombreencargado')) { detectedNomEnc = h; break; }
      }
      state.file5.idCuadrillaCol = detectedIdCuad || headers[0];
      state.file5.descCol = detectedDesc || (headers.length > 8 ? headers[8] : (headers.length > 1 ? headers[1] : headers[0]));
      state.file5.nombreEncargadoCol = detectedNomEnc || (headers.length > 1 ? headers[1] : headers[0]);
    }
  }

  // Update UI Card after upload
  function updateFileCardUI(fileIndex, file, rowCount) {
    const card = elements[`card${fileIndex}`];
    const infoBox = elements[`fileInfo${fileIndex}`];
    const nameEl = infoBox.querySelector('.file-name');
    const metaEl = infoBox.querySelector('.file-meta');
    const removeBtn = infoBox.querySelector('.btn-remove-file');

    card.classList.add('loaded');
    infoBox.classList.add('active');
    nameEl.textContent = file.name;
    metaEl.textContent = `${formatBytes(file.size)} • ${rowCount.toLocaleString()} filas`;

    populateSelects(fileIndex);

    removeBtn.onclick = (e) => {
      e.stopPropagation();
      resetSingleFile(fileIndex);
    };
  }

  // Populate Selects
  function populateSelects(fileIndex) {
    const fileKey = `file${fileIndex}`;
    const headers = state[fileKey].headers;
    const sheetNames = state[fileKey].sheetNames || [];
    const sheetGroup = elements[`sheetGroup${fileIndex}`];
    const sheetSelect = elements[`sheetSelect${fileIndex}`];

    if (sheetGroup && sheetSelect) {
      if (sheetNames.length > 1) {
        sheetGroup.style.display = 'block';
        populateSelect(sheetSelect, sheetNames, state[fileKey].selectedSheet);
        sheetSelect.onchange = (e) => {
          const newSheet = e.target.value;
          if (newSheet && newSheet !== state[fileKey].selectedSheet) {
            loadSheetData(fileIndex, newSheet, state[fileKey].fileObj);
          }
        };
      } else {
        sheetGroup.style.display = 'none';
      }
    }

    if (fileIndex === 1) {
      populateSelect(elements.keySelect1, headers, state.file1.keyCol);
      elements.keySelect1.onchange = (e) => { state.file1.keyCol = e.target.value; };
      if (elements.paternoSelect1) {
        populateSelect(elements.paternoSelect1, headers, state.file1.patCol, '(Opcional)');
        elements.paternoSelect1.onchange = (e) => { state.file1.patCol = e.target.value; };
      }
      if (elements.maternoSelect1) {
        populateSelect(elements.maternoSelect1, headers, state.file1.matCol, '(Opcional)');
        elements.maternoSelect1.onchange = (e) => { state.file1.matCol = e.target.value; };
      }
      if (elements.nombresSelect1) {
        populateSelect(elements.nombresSelect1, headers, state.file1.nomCol, '(Auto-detectar)');
        elements.nombresSelect1.onchange = (e) => { state.file1.nomCol = e.target.value; };
      }
    } else if (fileIndex === 2) {
      populateSelect(elements.keySelect2, headers, state.file2.keyCol);
      populateSelect(elements.actSelect2, headers, state.file2.actCol);
      if (elements.laborSelect2) {
        populateSelect(elements.laborSelect2, headers, state.file2.laborCol);
        elements.laborSelect2.onchange = (e) => { state.file2.laborCol = e.target.value; };
      }
      if (elements.cuadrillaSelect2) {
        populateSelect(elements.cuadrillaSelect2, headers, state.file2.cuadrillaCol, '(Auto-detectar)');
        elements.cuadrillaSelect2.onchange = (e) => { state.file2.cuadrillaCol = e.target.value; };
      }
      if (elements.turnoSelect2) {
        populateSelect(elements.turnoSelect2, headers, state.file2.turnoCol, '(Auto-detectar)');
        elements.turnoSelect2.onchange = (e) => { state.file2.turnoCol = e.target.value; };
      }
      elements.keySelect2.onchange = (e) => { state.file2.keyCol = e.target.value; };
      elements.actSelect2.onchange = (e) => { state.file2.actCol = e.target.value; };
    } else if (fileIndex === 3) {
      populateSelect(elements.keySelect3, headers, state.file3.keyCol);
      elements.keySelect3.onchange = (e) => { state.file3.keyCol = e.target.value; };
      if (elements.nomEstSelect3) {
        populateSelect(elements.nomEstSelect3, headers, state.file3.nomEstCol, '(Auto-detectar)');
        elements.nomEstSelect3.onchange = (e) => { state.file3.nomEstCol = e.target.value; };
      }
      if (elements.tipoEstSelect3) {
        populateSelect(elements.tipoEstSelect3, headers, state.file3.tipoEstCol, '(Auto-detectar)');
        elements.tipoEstSelect3.onchange = (e) => { state.file3.tipoEstCol = e.target.value; };
      }
    } else if (fileIndex === 4) {
      if (elements.patenteSelect4) {
        populateSelect(elements.patenteSelect4, headers, state.file4.patenteCol);
        elements.patenteSelect4.onchange = (e) => { state.file4.patenteCol = e.target.value; };
      }
      if (elements.codBusSelect4) {
        populateSelect(elements.codBusSelect4, headers, state.file4.codBusCol);
        elements.codBusSelect4.onchange = (e) => { state.file4.codBusCol = e.target.value; };
      }
      if (elements.rutaSelect4) {
        populateSelect(elements.rutaSelect4, headers, state.file4.rutaCol);
        elements.rutaSelect4.onchange = (e) => { state.file4.rutaCol = e.target.value; };
      }
    } else if (fileIndex === 5) {
      if (elements.idcuadrillaSelect5) {
        populateSelect(elements.idcuadrillaSelect5, headers, state.file5.idCuadrillaCol);
        elements.idcuadrillaSelect5.onchange = (e) => { state.file5.idCuadrillaCol = e.target.value; };
      }
      if (elements.descCuadrillaSelect5) {
        populateSelect(elements.descCuadrillaSelect5, headers, state.file5.descCol);
        elements.descCuadrillaSelect5.onchange = (e) => { state.file5.descCol = e.target.value; };
      }
      if (elements.nombreEncargadoSelect5) {
        populateSelect(elements.nombreEncargadoSelect5, headers, state.file5.nombreEncargadoCol);
        elements.nombreEncargadoSelect5.onchange = (e) => { state.file5.nombreEncargadoCol = e.target.value; };
      }
    }
  }

  function populateSelect(selectEl, options, selectedValue, defaultLabel) {
    if (!selectEl) return;
    selectEl.innerHTML = '';
    
    if (defaultLabel) {
      const defaultOpt = document.createElement('option');
      defaultOpt.value = '';
      defaultOpt.textContent = defaultLabel;
      if (!selectedValue) defaultOpt.selected = true;
      selectEl.appendChild(defaultOpt);
    }

    options.forEach(opt => {
      const optEl = document.createElement('option');
      optEl.value = opt;
      optEl.textContent = opt;
      if (opt === selectedValue) optEl.selected = true;
      selectEl.appendChild(optEl);
    });
  }

  // Show File Preview Modal
  function showFilePreview(fileIndex) {
    const fileKey = `file${fileIndex}`;
    const fileData = state[fileKey].data;
    const headers = state[fileKey].headers;
    const fileName = state[fileKey].name || `Archivo ${fileIndex}`;
    const sheetName = state[fileKey].selectedSheet || 'Hoja 1';

    if (!fileData || fileData.length === 0) {
      showToast('No hay datos cargados en este archivo para previsualizar', 'info');
      return;
    }

    elements.previewTitle.textContent = `Vista Previa: ${fileName}`;
    elements.previewSubtitle.textContent = `Hoja "${sheetName}" • Mostrando primeras 10 filas de ${fileData.length.toLocaleString()} totales`;

    const sampleRows = fileData.slice(0, 10);
    let tableHtml = `
      <table class="data-table">
        <thead>
          <tr>
            ${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${sampleRows.map(row => `
            <tr>
              ${headers.map(h => `<td>${escapeHtml(String(row[h] !== undefined ? row[h] : ''))}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    elements.previewTableContainer.innerHTML = tableHtml;
    openModal(elements.modalPreview);
  }

  // Reset a single file
  function resetSingleFile(fileIndex) {
    const fileKey = `file${fileIndex}`;
    state[fileKey] = { data: null, name: null, headers: [], keyCol: '', patCol: '', matCol: '', nomCol: '', actCol: '', laborCol: '', turnoCol: '', cuadrillaCol: '', nomEstCol: '', tipoEstCol: '', patenteCol: '', codBusCol: '', rutaCol: '', idCuadrillaCol: '', descCol: '', nombreEncargadoCol: '', workbook: null, sheetNames: [], selectedSheet: '' };

    const card = elements[`card${fileIndex}`];
    const infoBox = elements[`fileInfo${fileIndex}`];
    const input = elements[`fileInput${fileIndex}`];

    card.classList.remove('loaded');
    infoBox.classList.remove('active');
    input.value = '';

    const sheetGroup = elements[`sheetGroup${fileIndex}`];
    const sheetSelect = elements[`sheetSelect${fileIndex}`];
    if (sheetGroup) sheetGroup.style.display = 'none';
    if (sheetSelect) sheetSelect.innerHTML = '';

    checkProcessingReadiness();
    showToast(`Archivo ${fileIndex} retirado`, 'info');
  }

  // Reset all
  function resetAll() {
    for (let i = 1; i <= 5; i++) resetSingleFile(i);
    state.consolidatedData = [];
    state.filteredData = [];
    elements.resultsSection.classList.remove('active');
    elements.step1.classList.add('active');
    elements.step1.classList.remove('completed');
    elements.step2.classList.remove('active', 'completed');
    elements.step3.classList.remove('active', 'completed');
    showToast('Todos los datos han sido restablecidos', 'info');
  }

  // Check processing readiness
  function checkProcessingReadiness() {
    const ready = state.file1.data && state.file2.data && state.file3.data;
    elements.btnProcess.disabled = !ready;
    if (ready) {
      elements.step1.classList.add('completed');
      elements.step2.classList.add('active');
    } else {
      elements.step1.classList.add('active');
      elements.step1.classList.remove('completed');
      elements.step2.classList.remove('active');
    }

    let loadedCount = 0;
    for (let i = 1; i <= 5; i++) {
      if (state[`file${i}`].data) loadedCount++;
    }
    if (elements.step1Desc) {
      elements.step1Desc.textContent = `${loadedCount} de 5 archivos cargados`;
    }
  }

  // Core Consolidation Engine
  function handleProcessData() {
    if (!state.file1.data || !state.file2.data || !state.file3.data) {
      showToast('Por favor carga los 3 archivos principales requeridos', 'error');
      return;
    }

    const keyCol1 = elements.keySelect1.value || state.file1.keyCol;
    const keyCol2 = elements.keySelect2.value || state.file2.keyCol;
    const actCol2 = elements.actSelect2.value || state.file2.actCol;
    const laborCol2 = (elements.laborSelect2 && elements.laborSelect2.value) || state.file2.laborCol;
    const turnoCol2 = (elements.turnoSelect2 && elements.turnoSelect2.value) || state.file2.turnoCol;
    const keyCol3 = elements.keySelect3.value || state.file3.keyCol;

    if (!keyCol1 || !keyCol2 || !keyCol3) {
      showToast('Por favor selecciona las columnas clave de vinculación', 'error');
      return;
    }

    // Step 1: Index File 3 (Marcaciones & Placas de Bus)
    const markingsIndex = new Map();
    const markingsBusPlacasIndex = new Map();

    const nomEstCol3 = (elements.nomEstSelect3 && elements.nomEstSelect3.value) || state.file3.nomEstCol;
    const tipoEstCol3 = (elements.tipoEstSelect3 && elements.tipoEstSelect3.value) || state.file3.tipoEstCol;

    state.file3.data.forEach(row => {
      const key = cleanHeader(row[keyCol3]);
      if (key) {
        const count = markingsIndex.get(key) || 0;
        markingsIndex.set(key, count + 1);

        let nomEstVal = (nomEstCol3 && row[nomEstCol3] !== undefined) ? formatCellValue(row[nomEstCol3]) : '';
        let tipoEstVal = (tipoEstCol3 && row[tipoEstCol3] !== undefined) ? formatCellValue(row[tipoEstCol3]) : '';

        if (!nomEstVal || !tipoEstVal) {
          for (const [colName, val] of Object.entries(row)) {
            const cleanCol = cleanHeader(colName);
            if (!tipoEstVal && (cleanCol.includes('tipoestacion') || cleanCol === 'tipo' || cleanCol.includes('tipoest'))) {
              tipoEstVal = formatCellValue(val);
            }
            if (!nomEstVal && (cleanCol.includes('nombreestacion') || cleanCol === 'estacion' || cleanCol.includes('nomest') || cleanCol.includes('placa'))) {
              nomEstVal = formatCellValue(val);
            }
          }
        }

        const isBus = String(tipoEstVal || '').trim().toUpperCase().includes('BUS');
        if (isBus && nomEstVal) {
          const cleanPlaca = String(nomEstVal).trim();
          if (cleanPlaca) {
            const existingPlacas = markingsBusPlacasIndex.get(key) || [];
            if (!existingPlacas.includes(cleanPlaca)) {
              existingPlacas.push(cleanPlaca);
              markingsBusPlacasIndex.set(key, existingPlacas);
            }
          }
        }
      }
    });

    // Step 2: Index File 4 (Catálogo de Buses y Rutas)
    const busesCatalogMap = new Map();
    if (state.file4.data && state.file4.data.length > 0) {
      const patenteCol4 = (elements.patenteSelect4 && elements.patenteSelect4.value) || state.file4.patenteCol;
      const codBusCol4 = (elements.codBusSelect4 && elements.codBusSelect4.value) || state.file4.codBusCol;
      const rutaCol4 = (elements.rutaSelect4 && elements.rutaSelect4.value) || state.file4.rutaCol;

      state.file4.data.forEach(busRow => {
        let patenteVal = (patenteCol4 && busRow[patenteCol4] !== undefined) ? formatCellValue(busRow[patenteCol4]) : '';
        let codBusVal = (codBusCol4 && busRow[codBusCol4] !== undefined) ? formatCellValue(busRow[codBusCol4]) : '';
        let rutaVal = (rutaCol4 && busRow[rutaCol4] !== undefined) ? formatCellValue(busRow[rutaCol4]) : '';

        if (!patenteVal || !codBusVal || !rutaVal) {
          for (const [colName, val] of Object.entries(busRow)) {
            const cleanCol = cleanHeader(colName);
            if (!patenteVal && (cleanCol === 'patente' || cleanCol.includes('patente') || cleanCol.includes('placa'))) patenteVal = formatCellValue(val);
            if (!codBusVal && (cleanCol === 'codigocampo' || cleanCol === 'codbus' || cleanCol.includes('codigocampo'))) codBusVal = formatCellValue(val);
            if (!rutaVal && (cleanCol === 'descripcionruta' || cleanCol === 'ruta' || cleanCol.includes('descripcionruta'))) rutaVal = formatCellValue(val);
          }
        }

        // Filtrar falsos positivos de ruta como booleanos o vigencia
        if (rutaVal) {
          const rLow = String(rutaVal).trim().toLowerCase();
          if (rLow === 'true' || rLow === 'false' || rLow === '0' || rLow === '1' || rLow === 'vigente' || rLow === 'no vigente' || rLow.includes('periodo')) {
            rutaVal = '';
          }
        }

        if (patenteVal) {
          const cleanPlate = cleanHeader(patenteVal);
          if (cleanPlate) {
            busesCatalogMap.set(cleanPlate, { codBus: codBusVal, ruta: rutaVal, patenteOriginal: patenteVal });
          }
        }
      });
    }

    // Step 2.5: Index File 5 (Catálogo de Cuadrillas & Encargados)
    const cuadrillasCatalogMap = new Map();
    if (state.file5.data && state.file5.data.length > 0) {
      const idCuadCol5 = (elements.idcuadrillaSelect5 && elements.idcuadrillaSelect5.value) || state.file5.idCuadrillaCol;
      const descCol5 = (elements.descCuadrillaSelect5 && elements.descCuadrillaSelect5.value) || state.file5.descCol;
      const nomCol5 = (elements.nombreEncargadoSelect5 && elements.nombreEncargadoSelect5.value) || state.file5.nombreEncargadoCol;

      state.file5.data.forEach(cRow => {
        let idVal = (idCuadCol5 && cRow[idCuadCol5] !== undefined) ? formatCellValue(cRow[idCuadCol5]) : '';
        let descVal = (descCol5 && cRow[descCol5] !== undefined) ? formatCellValue(cRow[descCol5]) : '';
        let nomVal = (nomCol5 && cRow[nomCol5] !== undefined) ? formatCellValue(cRow[nomCol5]) : '';

        if (!idVal || !descVal) {
          for (const [colName, val] of Object.entries(cRow)) {
            const cleanCol = cleanHeader(colName);
            if (!idVal && (cleanCol === 'idcuadrilla' || cleanCol.includes('idcuadrilla'))) idVal = formatCellValue(val);
            if (!descVal && (cleanCol === 'descripcion' || cleanCol.includes('descripcion') || cleanCol.includes('encargado'))) descVal = formatCellValue(val);
            if (!nomVal && (cleanCol === 'nombreencargado' || cleanCol.includes('nombreencargado'))) nomVal = formatCellValue(val);
          }
        }

        if (idVal) {
          const cleanId = cleanHeader(idVal);
          if (cleanId) cuadrillasCatalogMap.set(cleanId, descVal || nomVal || idVal);
        }
      });
    }

    // Step 3: Index File 2 (Último día laborado)
    const lastDayIndex = new Map();
    state.file2.data.forEach(row => {
      const key = cleanHeader(row[keyCol2]);
      if (key) lastDayIndex.set(key, row);
    });

    // Step 4: Consolidate (Con Deduplicación Estricta de Personal)
    let activeCount = 0;
    let absentCount = 0;
    let leaveCount = 0;

    const consolidated = [];
    const seenWorkerIds = new Set();

    state.file1.data.forEach(row1 => {
      const workerId = cleanHeader(row1[keyCol1]);
      if (!workerId) return;

      // Filtrar solo personal activo y no finiquitado
      if (isWorkerFiniquitado(row1)) {
        return;
      }

      // Evitar duplicar al trabajador si aparece repetido en la fuente
      if (seenWorkerIds.has(workerId)) {
        return;
      }
      seenWorkerIds.add(workerId);

      const row2 = lastDayIndex.get(workerId) || null;
      const markingCount = markingsIndex.get(workerId) || 0;
      const hasMarkings = markingCount > 0;

      const rawDig1 = extractRawFromRow(row1, ['tienedigitacionjornal', 'tienedigitacion', 'digitacion', 'jornal', 'digitado', 'esjornal']);
      const rawDig2 = row2 ? extractRawFromRow(row2, ['tienedigitacionjornal', 'tienedigitacion', 'digitacion', 'jornal', 'digitado', 'esjornal']) : null;
      const digText = String(rawDig1 || rawDig2 || '').trim().toUpperCase();

      let actividadVal = '';
      let laborVal = '';

      if (row2) {
        if (actCol2 && row2[actCol2] !== undefined && formatCellValue(row2[actCol2]) !== '') {
          actividadVal = formatCellValue(row2[actCol2]);
        } else {
          actividadVal = extractFromRow(row2, ['actividad', 'tipoactividad', 'motivo', 'condicion', 'situacion']);
        }

        if (laborCol2 && row2[laborCol2] !== undefined && formatCellValue(row2[laborCol2]) !== '') {
          laborVal = formatCellValue(row2[laborCol2]);
        } else {
          laborVal = extractFromRow(row2, ['labor', 'labores', 'detallelabor', 'tarea', 'descripcionlabor']);
        }
      }

      const refDate = getReferenceDate();

      let estadoVal = '';
      if (actividadVal && isAbsenceActivity(actividadVal)) {
        estadoVal = String(actividadVal).trim().toUpperCase();
        leaveCount++;
      } else if (laborVal && isAbsenceActivity(laborVal)) {
        estadoVal = String(laborVal).trim().toUpperCase();
        leaveCount++;
      } else if (digText === 'NO' || digText === 'N') {
        estadoVal = 'ACTIVO';
        activeCount++;
      } else if (hasMarkings) {
        estadoVal = 'ACTIVO';
        activeCount++;
      } else if (row2 && (actividadVal || laborVal)) {
        // Verificar si la fecha de último día laborado está dentro de los últimos 4 días
        const rawUltDia = extractRawFromRow(row2, ['ultimodia', 'ultimo_dia', 'fechaultimodia', 'fecha_ultimo_dia', 'fecultdia', 'ultimodialaborado', 'hasta', 'fechahasta']);
        const ultDiaDate = parseDateValue(rawUltDia);
        
        let diffDays = 999;
        if (ultDiaDate && refDate) {
          const diffMs = Math.abs(refDate.getTime() - ultDiaDate.getTime());
          diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        }

        // Si tiene labores dentro de los últimos 4 días (o labor activa registrada)
        if (diffDays <= 4 || (!ultDiaDate && (actividadVal || laborVal))) {
          estadoVal = 'ACTIVO';
          activeCount++;
        } else {
          estadoVal = 'AUSENTE';
          absentCount++;
        }
      } else {
        estadoVal = 'AUSENTE';
        absentCount++;
      }

      // Concatenación de Apellidos y Nombres
      const patCol1 = (elements.paternoSelect1 && elements.paternoSelect1.value) || state.file1.patCol;
      const matCol1 = (elements.maternoSelect1 && elements.maternoSelect1.value) || state.file1.matCol;
      const nomCol1 = (elements.nombresSelect1 && elements.nombresSelect1.value) || state.file1.nomCol;

      let valPat = (patCol1 && row1[patCol1] !== undefined) ? formatCellValue(row1[patCol1]) : '';
      let valMat = (matCol1 && row1[matCol1] !== undefined) ? formatCellValue(row1[matCol1]) : '';
      let valNom = (nomCol1 && row1[nomCol1] !== undefined) ? formatCellValue(row1[nomCol1]) : '';

      let nombreConsolidado = '';
      if (valPat || valMat || valNom) {
        const fullApe = [valPat, valMat].filter(Boolean).join(' ').trim();
        if (fullApe && valNom) {
          if (valNom.toLowerCase().includes(fullApe.toLowerCase())) {
            nombreConsolidado = valNom.replace(/\s+/g, ' ').trim();
          } else {
            nombreConsolidado = `${fullApe} ${valNom}`.replace(/\s+/g, ' ').trim();
          }
        } else if (fullApe) {
          nombreConsolidado = fullApe;
        } else {
          const autoFull = getFullName(row1, row2);
          nombreConsolidado = autoFull || valNom;
        }
      } else {
        nombreConsolidado = getFullName(row1, row2);
      }

      // PLACA
      let placaConsolidada = '';
      const busPlacas = markingsBusPlacasIndex.get(workerId);
      if (busPlacas && busPlacas.length > 0) {
        placaConsolidada = busPlacas.join(' / ');
      } else {
        placaConsolidada = extractFromRow(row2, ['buspatente', 'patente', 'placabus', 'placa']) ||
                           extractFromRow(row1, ['buspatente', 'patente', 'placabus', 'placa']);
      }

      // CODIGO BUS y RUTA
      let codigoBusConsolidado = '';
      let rutaConsolidada = '';

      if (placaConsolidada && busesCatalogMap.size > 0) {
        const placasArray = placaConsolidada.split('/').map(p => cleanHeader(p)).filter(Boolean);
        const codigosList = [];
        const rutasList = [];

        placasArray.forEach(cleanP => {
          const busInfo = busesCatalogMap.get(cleanP);
          if (busInfo) {
            if (busInfo.codBus && !codigosList.includes(busInfo.codBus)) codigosList.push(busInfo.codBus);
            if (busInfo.ruta && !rutasList.includes(busInfo.ruta)) rutasList.push(busInfo.ruta);
          }
        });

        if (codigosList.length > 0) codigoBusConsolidado = codigosList.join(' / ');
        if (rutasList.length > 0) rutaConsolidada = rutasList.join(' / ');
      }

      if (!codigoBusConsolidado) codigoBusConsolidado = extractValueForColumn('CODIGO BUS', row2, row1, keyCol1);
      if (!rutaConsolidada) rutaConsolidada = extractValueForColumn('RUTA', row2, row1, keyCol1);

      // TURNO (Hora de inicio del Archivo 2 / Último Día)
      let turnoConsolidado = '';
      if (row2) {
        if (turnoCol2 && row2[turnoCol2] !== undefined && String(row2[turnoCol2]).trim() !== '') {
          turnoConsolidado = formatTimeValue(row2[turnoCol2]);
        }
        if (!turnoConsolidado) {
          const rawHora = extractRawFromRow(row2, ['horainicio', 'hora_inicio', 'horadeinicio', 'horaingreso', 'horarioinicio', 'hora', 'horainic', 'turno']);
          if (rawHora !== null && rawHora !== undefined && String(rawHora).trim() !== '') {
            turnoConsolidado = formatTimeValue(rawHora);
          }
        }
      }
      if (!turnoConsolidado && row1) {
        const rawHora1 = extractRawFromRow(row1, ['horainicio', 'hora_inicio', 'horadeinicio', 'horaingreso', 'turno', 'horario']);
        if (rawHora1 !== null && rawHora1 !== undefined && String(rawHora1).trim() !== '') {
          turnoConsolidado = formatTimeValue(rawHora1);
        }
      }

      // Zona Labores y SubCentroCosto / Cuartel
      const hasRegularLaborInFile2 = row2 && (actividadVal || laborVal) && !isAbsenceActivity(actividadVal) && !isAbsenceActivity(laborVal);

      let zonaConsolidada = '';
      if (hasRegularLaborInFile2 && row2) {
        // En Archivo 2 buscar ZONA o Zona Labores (sin tomar Labor)
        zonaConsolidada = extractFromRow(row2, ['zona', 'zonalabores', 'zonadelabores', 'sede', 'fundo', 'campo', 'ubicacion']) ||
                          extractFromRow(row1, ['zonalabores', 'zonadelabores', 'centrocostopredio', 'nombrezonatrab', 'zona', 'sede', 'fundo', 'campo']);
      } else {
        zonaConsolidada = extractFromRow(row1, ['zonalabores', 'zonadelabores', 'centrocostopredio', 'nombrezonatrab', 'zona', 'sede', 'fundo', 'campo']) ||
                          (row2 ? extractFromRow(row2, ['zona', 'zonalabores', 'zonadelabores', 'sede', 'fundo', 'campo', 'ubicacion']) : '');
      }

      let cuartelConsolidado = '';
      if (hasRegularLaborInFile2 && row2) {
        cuartelConsolidado = extractFromRow(row2, ['cuartelsector', 'cuartel_sector', 'cuartel', 'sector', 'subcentrocostocuartel', 'subcentrocosto', 'centrocosto', 'ceco', 'lote', 'valvula']) ||
                             extractFromRow(row1, ['subcentrocostocuartel', 'subcentrocosto', 'cuartel', 'centrocosto', 'ceco', 'lote']);
      } else {
        cuartelConsolidado = extractFromRow(row1, ['subcentrocostocuartel', 'subcentrocosto', 'cuartel', 'centrocosto', 'ceco', 'lote']) ||
                             (row2 ? extractFromRow(row2, ['cuartelsector', 'cuartel_sector', 'cuartel', 'sector', 'subcentrocostocuartel', 'subcentrocosto', 'centrocosto', 'ceco', 'lote', 'valvula']) : '');
      }

      // ENCARGADO: IdCuadrilla + Descripcion de la Cuadrilla
      let encargadoConsolidado = '';
      const rawIdCuadrilla = (row2 ? (elements.cuadrillaSelect2 && elements.cuadrillaSelect2.value && row2[elements.cuadrillaSelect2.value] !== undefined ? formatCellValue(row2[elements.cuadrillaSelect2.value]) : extractFromRow(row2, ['idcuadrilla', 'id_cuadrilla', 'cuadrilla'])) : '') ||
                             extractFromRow(row1, ['idcuadrilla', 'id_cuadrilla', 'cuadrilla']);
      
      if (rawIdCuadrilla) {
        const cleanIdCuad = cleanHeader(rawIdCuadrilla);
        if (cuadrillasCatalogMap.size > 0 && cuadrillasCatalogMap.has(cleanIdCuad)) {
          const descCuad = cuadrillasCatalogMap.get(cleanIdCuad);
          if (descCuad) {
            if (descCuad.startsWith(rawIdCuadrilla)) {
              encargadoConsolidado = descCuad;
            } else {
              encargadoConsolidado = `${rawIdCuadrilla} ${descCuad}`;
            }
          } else {
            encargadoConsolidado = rawIdCuadrilla;
          }
        } else {
          encargadoConsolidado = rawIdCuadrilla;
        }
      }
      if (!encargadoConsolidado) {
        encargadoConsolidado = extractValueForColumn('ENCARGADO', row2, row1, keyCol1);
      }

      // Empresa
      let empresaConsolidada = '';
      const rawEmpresa = extractFromRow(row1, ['empresa', 'nombreempresa', 'razonsocial', 'compania', 'nom_empresa', 'idempresa']) ||
                         (row2 ? extractFromRow(row2, ['empresa', 'nombreempresa', 'razonsocial', 'compania', 'idempresa']) : '');
      if (rawEmpresa) {
        const cleanEmp = String(rawEmpresa).trim();
        if (EMPRESAS_MAP[cleanEmp]) {
          empresaConsolidada = EMPRESAS_MAP[cleanEmp];
        } else {
          empresaConsolidada = cleanEmp;
        }
      } else {
        empresaConsolidada = 'SOCIEDAD EXPORTADORA VERFRUT S. A. C.';
      }

      const consolidatedRow = {};
      TARGET_COLUMNS.forEach(colName => {
        if (colName === 'Empresa') {
          consolidatedRow['Empresa'] = empresaConsolidada || '';
        } else if (colName === 'ESTADO') {
          consolidatedRow['ESTADO'] = estadoVal;
        } else if (colName === 'ACTIVIDAD') {
          consolidatedRow['ACTIVIDAD'] = actividadVal || '';
        } else if (colName === 'LABOR') {
          consolidatedRow['LABOR'] = laborVal || '';
        } else if (colName === 'ENCARGADO') {
          consolidatedRow['ENCARGADO'] = encargadoConsolidado || '';
        } else if (colName === 'TURNO') {
          consolidatedRow['TURNO'] = turnoConsolidado || '';
        } else if (colName === 'Apellidos y Nombres') {
          consolidatedRow['Apellidos y Nombres'] = nombreConsolidado;
        } else if (colName === 'PLACA') {
          consolidatedRow['PLACA'] = placaConsolidada || '';
        } else if (colName === 'CODIGO BUS') {
          consolidatedRow['CODIGO BUS'] = codigoBusConsolidado || '';
        } else if (colName === 'RUTA') {
          consolidatedRow['RUTA'] = rutaConsolidada || '';
        } else if (colName === 'Zona Labores') {
          consolidatedRow['Zona Labores'] = zonaConsolidada || '';
        } else if (colName === 'SubCentroCosto / Cuartel') {
          consolidatedRow['SubCentroCosto / Cuartel'] = cuartelConsolidado || '';
        } else {
          consolidatedRow[colName] = extractValueForColumn(colName, row2, row1, keyCol1);
        }
      });

      consolidated.push(consolidatedRow);
    });

    // Update State
    state.consolidatedData = consolidated;
    state.filteredData = [...consolidated];
    state.currentPage = 1;
    state.metrics = {
      total: consolidated.length,
      active: activeCount,
      absent: absentCount,
      leave: leaveCount
    };

    // Update Wizard steps
    elements.step2.classList.add('completed');
    elements.step3.classList.add('active');

    // Render Metrics, Distribution & Table
    updateMetricsAndDistributionUI();
    renderTableHeader();
    sortData();
    renderTable();

    elements.resultsSection.classList.add('active');
    elements.resultsSection.scrollIntoView({ behavior: 'smooth' });

    showToast(`¡Consolidación exitosa! ${consolidated.length.toLocaleString()} registros procesados.`, 'success');
  }

  // Update Metrics & Distribution Bar
  function updateMetricsAndDistributionUI() {
    const total = state.metrics.total || 0;
    const active = state.metrics.active || 0;
    const absent = state.metrics.absent || 0;
    const leave = state.metrics.leave || 0;

    const pctActive = total > 0 ? ((active / total) * 100).toFixed(1) : '0.0';
    const pctAbsent = total > 0 ? ((absent / total) * 100).toFixed(1) : '0.0';
    const pctLeave = total > 0 ? ((leave / total) * 100).toFixed(1) : '0.0';

    if (elements.metricTotal) elements.metricTotal.textContent = total.toLocaleString();
    if (elements.metricActive) elements.metricActive.textContent = active.toLocaleString();
    if (elements.metricAbsent) elements.metricAbsent.textContent = absent.toLocaleString();
    if (elements.metricLeave) elements.metricLeave.textContent = leave.toLocaleString();

    if (elements.kpiPctActive) elements.kpiPctActive.textContent = `${pctActive}%`;
    if (elements.kpiPctAbsent) elements.kpiPctAbsent.textContent = `${pctAbsent}%`;
    if (elements.kpiPctLeave) elements.kpiPctLeave.textContent = `${pctLeave}%`;

    if (elements.pctActive) elements.pctActive.textContent = `${pctActive}% (${active})`;
    if (elements.pctAbsent) elements.pctAbsent.textContent = `${pctAbsent}% (${absent})`;
    if (elements.pctLeave) elements.pctLeave.textContent = `${pctLeave}% (${leave})`;

    if (elements.distActive) elements.distActive.style.width = `${pctActive}%`;
    if (elements.distAbsent) elements.distAbsent.style.width = `${pctAbsent}%`;
    if (elements.distLeave) elements.distLeave.style.width = `${pctLeave}%`;

    // Update filter chip counters
    if (elements.countChipAll) elements.countChipAll.textContent = total.toLocaleString();
    if (elements.countChipActive) elements.countChipActive.textContent = active.toLocaleString();
    if (elements.countChipAbsent) elements.countChipAbsent.textContent = absent.toLocaleString();
    if (elements.countChipLeave) elements.countChipLeave.textContent = leave.toLocaleString();
  }

  // Filter & Search Logic
  function applyFilters() {
    let result = state.consolidatedData;

    if (state.activeFilter === 'ACTIVE') {
      result = result.filter(r => r['ESTADO'] === 'ACTIVO');
    } else if (state.activeFilter === 'ABSENT') {
      result = result.filter(r => r['ESTADO'] === 'AUSENTE');
    } else if (state.activeFilter === 'LEAVE') {
      result = result.filter(r => r['ESTADO'] !== 'ACTIVO' && r['ESTADO'] !== 'AUSENTE');
    }

    if (state.searchTerm) {
      result = result.filter(row => {
        return Object.values(row).some(val =>
          String(val).toLowerCase().includes(state.searchTerm)
        );
      });
    }

    state.filteredData = result;
    sortData();
    renderTable();
  }

  // Table Sorting Logic
  function sortData() {
    if (!state.sortColumn) return;
    const col = state.sortColumn;
    const dir = state.sortDirection === 'asc' ? 1 : -1;

    state.filteredData.sort((a, b) => {
      const valA = a[col] !== undefined ? a[col] : '';
      const valB = b[col] !== undefined ? b[col] : '';

      const numA = Number(valA);
      const numB = Number(valB);
      if (!isNaN(numA) && !isNaN(numB) && valA !== '' && valB !== '') {
        return (numA - numB) * dir;
      }

      return String(valA).localeCompare(String(valB), 'es', { numeric: true, sensitivity: 'base' }) * dir;
    });
  }

  // Render Table Header with sorting & visibility
  function renderTableHeader() {
    const visibleCols = TARGET_COLUMNS.filter(c => state.visibleColumns.has(c));

    elements.tableHead.innerHTML = `
      <tr>
        ${visibleCols.map(col => {
          const isSorted = state.sortColumn === col;
          const sortIcon = isSorted ? (state.sortDirection === 'asc' ? '▲' : '▼') : '▲▼';
          const sortClass = isSorted ? (state.sortDirection === 'asc' ? 'asc' : 'desc') : '';

          return `
            <th data-column="${escapeHtml(col)}" title="Ordenar por ${escapeHtml(col)}">
              <div class="th-content">
                <span>${escapeHtml(col)}</span>
                <span class="sort-indicator ${sortClass}">${sortIcon}</span>
              </div>
            </th>
          `;
        }).join('')}
      </tr>
    `;

    // Attach sort listeners
    elements.tableHead.querySelectorAll('th').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.column;
        if (state.sortColumn === col) {
          state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
          state.sortColumn = col;
          state.sortDirection = 'asc';
        }
        renderTableHeader();
        sortData();
        renderTable();
      });
    });
  }

  // Search Highlighting Helper
  function highlightText(text, search) {
    if (!search || !text) return escapeHtml(String(text));
    const str = String(text);
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedSearch})`, 'gi');
    return escapeHtml(str).replace(regex, '<mark class="search-highlight">$1</mark>');
  }

  // Render Table Body & Pagination
  function renderTable() {
    const visibleCols = TARGET_COLUMNS.filter(c => state.visibleColumns.has(c));
    const totalItems = state.filteredData.length;
    const startIdx = (state.currentPage - 1) * state.pageSize;
    const endIdx = Math.min(startIdx + state.pageSize, totalItems);
    const pageItems = state.filteredData.slice(startIdx, endIdx);

    if (totalItems === 0) {
      elements.tableBody.innerHTML = `
        <tr>
          <td colspan="${visibleCols.length}" style="text-align: center; padding: 3rem; color: var(--text-muted);">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 0.5rem; opacity: 0.6;"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            <div>No se encontraron registros que coincidan con la búsqueda o filtro aplicado.</div>
          </td>
        </tr>
      `;
      elements.pageStart.textContent = '0';
      elements.pageEnd.textContent = '0';
      elements.pageTotal.textContent = '0';
      elements.btnFirstPage.disabled = true;
      elements.btnPrevPage.disabled = true;
      elements.btnNextPage.disabled = true;
      elements.btnLastPage.disabled = true;
      elements.pageNumDisplay.textContent = 'Pág. 0 de 0';
      return;
    }

    let html = '';
    pageItems.forEach((row, idx) => {
      html += `<tr data-row-index="${startIdx + idx}" title="Clic para ver expediente completo">`;
      visibleCols.forEach(col => {
        const val = row[col] !== undefined ? row[col] : '';

        if (col === 'ESTADO') {
          html += `<td>${renderStatusBadge(val)}</td>`;
        } else if (col === 'ACTIVIDAD' || col === 'LABOR') {
          html += `<td><span style="font-weight: 700; color: var(--text-main);">${highlightText(val, state.searchTerm)}</span></td>`;
        } else if (col === 'Tiene Digitacion (jornal)') {
          const isDigitado = String(val).toUpperCase().includes('SI') || String(val).toUpperCase().includes('SÍ') || val === '1' || val === true;
          html += `<td><span style="font-weight: 700; color: ${isDigitado ? 'var(--success-700)' : 'var(--text-muted)'}">${highlightText(val, state.searchTerm)}</span></td>`;
        } else {
          html += `<td>${highlightText(val, state.searchTerm)}</td>`;
        }
      });
      html += '</tr>';
    });

    elements.tableBody.innerHTML = html;

    // Attach row click listeners for Worker Dossier Modal
    elements.tableBody.querySelectorAll('tr').forEach(tr => {
      tr.addEventListener('click', () => {
        const rowIdx = parseInt(tr.dataset.rowIndex, 10);
        if (!isNaN(rowIdx) && state.filteredData[rowIdx]) {
          showWorkerDossier(state.filteredData[rowIdx]);
        }
      });
    });

    const maxPage = Math.ceil(totalItems / state.pageSize) || 1;
    elements.pageStart.textContent = (startIdx + 1).toLocaleString();
    elements.pageEnd.textContent = endIdx.toLocaleString();
    elements.pageTotal.textContent = totalItems.toLocaleString();
    elements.pageNumDisplay.textContent = `Pág. ${state.currentPage} de ${maxPage}`;

    elements.btnFirstPage.disabled = state.currentPage <= 1;
    elements.btnPrevPage.disabled = state.currentPage <= 1;
    elements.btnNextPage.disabled = state.currentPage >= maxPage;
    elements.btnLastPage.disabled = state.currentPage >= maxPage;
  }

  // Show Worker Dossier Modal
  function showWorkerDossier(row) {
    const fullName = row['Apellidos y Nombres'] || 'Trabajador';
    const dni = row['RutTrabajador'] || '-';
    const codigo = row['CodigoTrabajador'] || '-';
    const estado = row['ESTADO'] || '-';

    elements.dossierWorkerName.textContent = fullName;
    elements.dossierWorkerDni.textContent = `DNI / RUT: ${dni} • Código Ficha: ${codigo}`;
    elements.dossierStatusBadge.innerHTML = renderStatusBadge(estado);

    // Initials for avatar
    const parts = fullName.split(' ').filter(Boolean);
    const initials = parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : (fullName.slice(0, 2).toUpperCase() || 'TR');
    elements.dossierAvatar.textContent = initials;

    elements.dossierBody.innerHTML = `
      <div class="dossier-grid">
        
        <!-- Card 1: Datos Personales -->
        <div class="dossier-card">
          <div class="dossier-card-title">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            Datos Personales
          </div>
          <div class="dossier-field-row"><span class="dossier-field-label">Rut / DNI:</span><span class="dossier-field-value">${escapeHtml(row['RutTrabajador'] || '-')}</span></div>
          <div class="dossier-field-row"><span class="dossier-field-label">Código:</span><span class="dossier-field-value">${escapeHtml(row['CodigoTrabajador'] || '-')}</span></div>
          <div class="dossier-field-row"><span class="dossier-field-label">Nombres:</span><span class="dossier-field-value">${escapeHtml(row['Apellidos y Nombres'] || '-')}</span></div>
          <div class="dossier-field-row"><span class="dossier-field-label">Fec. Nacimiento:</span><span class="dossier-field-value">${escapeHtml(row['FechaNacimiento'] || '-')}</span></div>
          <div class="dossier-field-row"><span class="dossier-field-label">Sexo:</span><span class="dossier-field-value">${escapeHtml(row['Sexo'] || '-')}</span></div>
          <div class="dossier-field-row"><span class="dossier-field-label">Edad:</span><span class="dossier-field-value">${escapeHtml(row['Edad'] || '-')}</span></div>
        </div>

        <!-- Card 2: Contrato & Puesto -->
        <div class="dossier-card">
          <div class="dossier-card-title">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>
            Contrato & Cargo
          </div>
          <div class="dossier-field-row"><span class="dossier-field-label">Empresa:</span><span class="dossier-field-value">${escapeHtml(row['Empresa'] || '-')}</span></div>
          <div class="dossier-field-row"><span class="dossier-field-label">Régimen:</span><span class="dossier-field-value">${escapeHtml(row['Regimen'] || '-')}</span></div>
          <div class="dossier-field-row"><span class="dossier-field-label">Oficio / Cargo:</span><span class="dossier-field-value">${escapeHtml(row['Oficio'] || '-')}</span></div>
          <div class="dossier-field-row"><span class="dossier-field-label">Inicio Periodo:</span><span class="dossier-field-value">${escapeHtml(row['FechaInicioPeriodo'] || '-')}</span></div>
          <div class="dossier-field-row"><span class="dossier-field-label">Inicio Contrato:</span><span class="dossier-field-value">${escapeHtml(row['FechaInicioContrato'] || '-')}</span></div>
          <div class="dossier-field-row"><span class="dossier-field-label">Término Contrato:</span><span class="dossier-field-value">${escapeHtml(row['FechaTerminoContrato'] || '-')}</span></div>
          <div class="dossier-field-row"><span class="dossier-field-label">Digitación (Jornal):</span><span class="dossier-field-value">${escapeHtml(row['Tiene Digitacion (jornal)'] || '-')}</span></div>
        </div>

        <!-- Card 3: Labores & Ubicación -->
        <div class="dossier-card">
          <div class="dossier-card-title">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
            Labores & Campo
          </div>
          <div class="dossier-field-row"><span class="dossier-field-label">Zona Labores:</span><span class="dossier-field-value">${escapeHtml(row['Zona Labores'] || '-')}</span></div>
          <div class="dossier-field-row"><span class="dossier-field-label">Cuartel / CeCo:</span><span class="dossier-field-value">${escapeHtml(row['SubCentroCosto / Cuartel'] || '-')}</span></div>
          <div class="dossier-field-row"><span class="dossier-field-label">ACTIVIDAD:</span><span class="dossier-field-value">${escapeHtml(row['ACTIVIDAD'] || '-')}</span></div>
          <div class="dossier-field-row"><span class="dossier-field-label">LABOR:</span><span class="dossier-field-value">${escapeHtml(row['LABOR'] || '-')}</span></div>
          <div class="dossier-field-row"><span class="dossier-field-label">ENCARGADO:</span><span class="dossier-field-value">${escapeHtml(row['ENCARGADO'] || '-')}</span></div>
        </div>

        <!-- Card 4: Transporte & Asistencia -->
        <div class="dossier-card">
          <div class="dossier-card-title">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="22" height="13" rx="2" ry="2"></rect><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>
            Transporte & Estado
          </div>
          <div class="dossier-field-row"><span class="dossier-field-label">Placa (Estación):</span><span class="dossier-field-value">${escapeHtml(row['PLACA'] || '-')}</span></div>
          <div class="dossier-field-row"><span class="dossier-field-label">Código Bus:</span><span class="dossier-field-value">${escapeHtml(row['CODIGO BUS'] || '-')}</span></div>
          <div class="dossier-field-row"><span class="dossier-field-label">Ruta:</span><span class="dossier-field-value">${escapeHtml(row['RUTA'] || '-')}</span></div>
          <div class="dossier-field-row"><span class="dossier-field-label">Turno (Hora):</span><span class="dossier-field-value">${escapeHtml(row['TURNO'] || '-')}</span></div>
          <div class="dossier-field-row"><span class="dossier-field-label">Hasta (Vigencia):</span><span class="dossier-field-value">${escapeHtml(row['HASTA'] || '-')}</span></div>
          <div class="dossier-field-row"><span class="dossier-field-label">ESTADO:</span><span class="dossier-field-value">${renderStatusBadge(row['ESTADO'])}</span></div>
        </div>

      </div>
    `;

    openModal(elements.modalDossier);
  }

  // Badge Renderer
  function renderStatusBadge(status) {
    const s = String(status || '').toUpperCase().trim();
    if (s === 'ACTIVO') {
      return `<span class="badge badge-activo"><span class="badge-dot"></span>ACTIVO</span>`;
    } else if (s === 'AUSENTE' || s === 'INACTIVO' || s.includes('SIN MARCACIÓN') || s.includes('SIN MARCACION')) {
      return `<span class="badge badge-ausente"><span class="badge-dot"></span>${escapeHtml(status)}</span>`;
    } else if (s.includes('LICENCIA') || s.includes('PERMISO') || s.includes('VACACIONES') || s.includes('S.P.L') || s.includes('SPL') || s.includes('FALTA') || s.includes('DESCANSO') || s.includes('MÉDICA') || s.includes('MEDICA') || s.includes('MATERNIDAD')) {
      return `<span class="badge badge-licencia"><span class="badge-dot"></span>${escapeHtml(status)}</span>`;
    } else {
      return `<span class="badge badge-other"><span class="badge-dot"></span>${escapeHtml(status)}</span>`;
    }
  }

  // Copy Table to Clipboard
  function copyTableToClipboard() {
    if (!state.filteredData || state.filteredData.length === 0) {
      showToast('No hay datos para copiar', 'info');
      return;
    }

    const visibleCols = TARGET_COLUMNS.filter(c => state.visibleColumns.has(c));
    let tsv = visibleCols.join('\t') + '\n';

    state.filteredData.forEach(row => {
      const rowVals = visibleCols.map(col => String(row[col] !== undefined ? row[col] : '').replace(/\t/g, ' '));
      tsv += rowVals.join('\t') + '\n';
    });

    navigator.clipboard.writeText(tsv).then(() => {
      showToast(`¡${state.filteredData.length.toLocaleString()} filas copiadas al portapapeles!`, 'success');
    }).catch(err => {
      showToast('Error al copiar al portapapeles: ' + err.message, 'error');
    });
  }

  // Export Data
  function exportData(format) {
    if (!state.consolidatedData || state.consolidatedData.length === 0) {
      showToast('No hay datos para exportar. Procesa los archivos primero.', 'error');
      return;
    }

    const timestamp = new Date().toISOString().slice(0, 10);
    const fileName = `Consolidado_Trabajadores_${timestamp}.${format}`;

    const formattedExportData = state.consolidatedData.map(row => {
      const orderedRow = {};
      TARGET_COLUMNS.forEach(col => {
        orderedRow[col] = row[col] !== undefined ? row[col] : '';
      });
      return orderedRow;
    });

    if (format === 'xlsx') {
      const ws = XLSX.utils.json_to_sheet(formattedExportData, { header: TARGET_COLUMNS });

      const colWidths = TARGET_COLUMNS.map(key => {
        let maxLen = key.length;
        formattedExportData.forEach(row => {
          const val = row[key];
          if (val) maxLen = Math.max(maxLen, String(val).length);
        });
        return { wch: Math.min(Math.max(maxLen + 3, 14), 40) };
      });
      ws['!cols'] = colWidths;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Consolidado');
      XLSX.writeFile(wb, fileName);
      showToast(`Archivo Excel exportado con éxito: ${fileName}`, 'success');
    } else if (format === 'csv') {
      const ws = XLSX.utils.json_to_sheet(formattedExportData, { header: TARGET_COLUMNS });
      const csvOutput = XLSX.utils.sheet_to_csv(ws);
      const blob = new Blob(["\uFEFF" + csvOutput], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast(`Archivo CSV exportado con éxito: ${fileName}`, 'success');
    }
  }

  // Load Demo Data
  function loadDemoData() {
    const demoTrabajadores = [
      { Regimen: 'Agrario', RutTrabajador: '70112233', CodigoTrabajador: 'TRAB-001', 'Ap.Paterno': 'Pérez', 'Ap. Materno': 'Ramos', Nombre: 'Juan Carlos', FechaNacimiento: '1992-04-15', Sexo: 'M', Edad: 34, FechaInicioPeriodo: '2026-01-01', FechaInicioContrato: '2022-03-15', FechaTerminoContrato: '2026-12-31', Oficio: 'Cosechador' },
      { Regimen: 'Agrario', RutTrabajador: '70223344', CodigoTrabajador: 'TRAB-002', 'Ap.Paterno': 'Rodríguez', 'Ap. Materno': 'Solís', Nombre: 'KASSANDRA EUFEMIA', FechaNacimiento: '1995-08-22', Sexo: 'F', Edad: 31, FechaInicioPeriodo: '2026-01-01', FechaInicioContrato: '2021-06-01', FechaTerminoContrato: '2026-12-31', Oficio: 'Seleccionadora' },
      { Regimen: 'General', RutTrabajador: '70334455', CodigoTrabajador: 'TRAB-003', 'Ap.Paterno': 'Sánchez', 'Ap. Materno': 'Morales', Nombre: 'Carlos Alberto', FechaNacimiento: '1988-11-03', Sexo: 'M', Edad: 37, FechaInicioPeriodo: '2026-01-01', FechaInicioContrato: '2020-01-10', FechaTerminoContrato: 'Indeterminado', Oficio: 'Supervisor de Campo' },
      { Regimen: 'Agrario', RutTrabajador: '70445566', CodigoTrabajador: 'TRAB-004', 'Ap.Paterno': 'Gómez', 'Ap. Materno': 'Torres', Nombre: 'Ana Lucía', FechaNacimiento: '1998-02-18', Sexo: 'F', Edad: 28, FechaInicioPeriodo: '2026-01-01', FechaInicioContrato: '2023-08-20', FechaTerminoContrato: '2026-12-31', Oficio: 'Empacadora' },
      { Regimen: 'Agrario', RutTrabajador: '70556677', CodigoTrabajador: 'TRAB-005', 'Ap.Paterno': 'Mendoza', 'Ap. Materno': 'Castro', Nombre: 'Luis Fernando', FechaNacimiento: '1990-07-30', Sexo: 'M', Edad: 36, FechaInicioPeriodo: '2026-01-01', FechaInicioContrato: '2019-11-05', FechaTerminoContrato: 'Indeterminado', Oficio: 'Técnico de Riego' },
      { Regimen: 'Agrario', RutTrabajador: '70667788', CodigoTrabajador: 'TRAB-006', 'Ap.Paterno': 'Vargas', 'Ap. Materno': 'Silva', Nombre: 'Patricia Sofía', FechaNacimiento: '1994-09-12', Sexo: 'F', Edad: 31, FechaInicioPeriodo: '2026-01-01', FechaInicioContrato: '2022-09-12', FechaTerminoContrato: '2026-12-31', Oficio: 'Evaluadora de Calidad' },
      { Regimen: 'Agrario', RutTrabajador: '70778899', CodigoTrabajador: 'TRAB-007', 'Ap.Paterno': 'Alva', 'Ap. Materno': 'Paredes', Nombre: 'Jorge Luis', FechaNacimiento: '1989-12-05', Sexo: 'M', Edad: 36, FechaInicioPeriodo: '2026-01-01', FechaInicioContrato: '2021-04-18', FechaTerminoContrato: '2026-12-31', Oficio: 'Conductor' },
      { Regimen: 'Agrario', RutTrabajador: '70889900', CodigoTrabajador: 'TRAB-008', 'Ap.Paterno': 'Fernández', 'Ap. Materno': 'Quintana', Nombre: 'Rosa María', FechaNacimiento: '1993-03-27', Sexo: 'F', Edad: 33, FechaInicioPeriodo: '2026-01-01', FechaInicioContrato: '2020-07-22', FechaTerminoContrato: 'Indeterminado', Oficio: 'Fitosanidad' },
      { Regimen: 'Agrario', RutTrabajador: '70990011', CodigoTrabajador: 'TRAB-009', 'Ap.Paterno': 'Chávez', 'Ap. Materno': 'Vega', Nombre: 'Diego Armando', FechaNacimiento: '1996-05-14', Sexo: 'M', Edad: 30, FechaInicioPeriodo: '2026-01-01', FechaInicioContrato: '2023-02-14', FechaTerminoContrato: '2026-12-31', Oficio: 'Estibador' },
      { Regimen: 'Agrario', RutTrabajador: '71001122', CodigoTrabajador: 'TRAB-010', 'Ap.Paterno': 'Navarro', 'Ap. Materno': 'Cruz', Nombre: 'Carmen Rosa', FechaNacimiento: '1991-10-08', Sexo: 'F', Edad: 34, FechaInicioPeriodo: '2026-01-01', FechaInicioContrato: '2022-10-01', FechaTerminoContrato: '2026-12-31', Oficio: 'Monitor SST' }
    ];

    const demoUltimoDia = [
      { RutTrabajador: '70112233', 'Tiene Digitacion (jornal)': 'SÍ', 'Zona Labores': 'Fundo San José', 'SubCentroCosto / Cuartel': 'Cuartel C-12 (Palto)', ACTIVIDAD: 'COSECHA', LABOR: 'Cosecha de Palta Hass', ENCARGADO: 'Roberto Gómez', NOMBRE_ESTACION: 'ESTACIÓN PACKING NORTE', 'CODIGO BUS': 'BUS-04', RUTA: 'Ruta 1 - Caserío Central', HoraInicio: '06:00 AM', 'ULTIMO DIA': '2026-08-18' },
      { RutTrabajador: '70223344', 'Tiene Digitacion (jornal)': 'NO', 'Zona Labores': 'Planta Packing', 'SubCentroCosto / Cuartel': 'Línea de Empaque 1', ACTIVIDAD: 'LICENCIA POR MATERNIDAD', LABOR: 'Selección y Calibrado', ENCARGADO: 'Mariela Rojas', NOMBRE_ESTACION: 'ESTACIÓN PRINCIPAL', 'CODIGO BUS': '-', RUTA: '-', HoraInicio: '07:00 AM', 'ULTIMO DIA': '2026-10-15' },
      { RutTrabajador: '70334455', 'Tiene Digitacion (jornal)': 'SÍ', 'Zona Labores': 'Fundo San José', 'SubCentroCosto / Cuartel': 'Sector A General', ACTIVIDAD: 'SUPERVISIÓN', LABOR: 'Control de Cuadrillas', ENCARGADO: 'Carlos Sánchez', NOMBRE_ESTACION: 'ESTACIÓN FUNDO CENTRAL', 'CODIGO BUS': 'CAM-01', RUTA: 'Ruta 2 - Sector Norte', HoraInicio: '05:30 AM', 'ULTIMO DIA': '2026-08-18' },
      { RutTrabajador: '70445566', 'Tiene Digitacion (jornal)': 'NO', 'Zona Labores': 'Planta Packing', 'SubCentroCosto / Cuartel': 'Área Terminado', ACTIVIDAD: 'PERMISO CON GOCE', LABOR: 'Envasado y Pesaje', ENCARGADO: 'Mariela Rojas', NOMBRE_ESTACION: 'ESTACIÓN PACKING SUR', 'CODIGO BUS': '-', RUTA: '-', HoraInicio: '07:00 AM', 'ULTIMO DIA': '2026-08-25' },
      { RutTrabajador: '70556677', 'Tiene Digitacion (jornal)': 'NO', 'Zona Labores': 'Fundo San José', 'SubCentroCosto / Cuartel': 'Estación de Riego 2', ACTIVIDAD: 'VACACIONES', LABOR: 'Control de Presurizado', ENCARGADO: 'Hernán Silva', NOMBRE_ESTACION: 'ESTACIÓN RIEGO', 'CODIGO BUS': '-', RUTA: '-', HoraInicio: '06:00 AM', 'ULTIMO DIA': '2026-08-30' },
      { RutTrabajador: '70667788', 'Tiene Digitacion (jornal)': 'SÍ', 'Zona Labores': 'Fundo Santa Rosa', 'SubCentroCosto / Cuartel': 'Cuartel B-04 (Arándano)', ACTIVIDAD: 'EVALUACIÓN', LABOR: 'Muestreo de Brix', ENCARGADO: 'Patricia Vargas', NOMBRE_ESTACION: 'ESTACIÓN SANTA ROSA', 'CODIGO BUS': 'BUS-02', RUTA: 'Ruta 3 - Los Olivos', HoraInicio: '06:00 AM', 'ULTIMO DIA': '2026-08-18' },
      { RutTrabajador: '70778899', 'Tiene Digitacion (jornal)': 'NO', 'Zona Labores': 'Logística Central', 'SubCentroCosto / Cuartel': 'Flota Vehicular', ACTIVIDAD: 'PERMISO PARTICULAR', LABOR: 'Traslado de Cosecha', ENCARGADO: 'Esteban Quispe', NOMBRE_ESTACION: 'ESTACIÓN COCHERA', 'CODIGO BUS': '-', RUTA: '-', HoraInicio: '06:00 AM', 'ULTIMO DIA': '2026-08-28' },
      { RutTrabajador: '70889900', 'Tiene Digitacion (jornal)': 'SÍ', 'Zona Labores': 'Fundo San José', 'SubCentroCosto / Cuartel': 'Cuartel D-08 (Uva)', ACTIVIDAD: 'APLICACIÓN', LABOR: 'Evaluación Fitosanitaria', ENCARGADO: 'Guillermo Paz', NOMBRE_ESTACION: 'ESTACIÓN SAN JOSÉ', 'CODIGO BUS': 'BUS-05', RUTA: 'Ruta 1 - Caserío Central', HoraInicio: '05:45 AM', 'ULTIMO DIA': '2026-08-18' },
      { RutTrabajador: '70990011', 'Tiene Digitacion (jornal)': 'NO', 'Zona Labores': 'Planta Packing', 'SubCentroCosto / Cuartel': 'Cámara Fría 1', ACTIVIDAD: 'DESCANSO MÉDICO', LABOR: 'Paletizado y Despacho', ENCARGADO: 'Manuel Farfán', NOMBRE_ESTACION: 'ESTACIÓN PACKING NORTE', 'CODIGO BUS': '-', RUTA: '-', HoraInicio: '02:00 PM', 'ULTIMO DIA': '2026-08-22' },
      { RutTrabajador: '71001122', 'Tiene Digitacion (jornal)': 'SÍ', 'Zona Labores': 'Todas las Sedes', 'SubCentroCosto / Cuartel': 'SST General', ACTIVIDAD: 'INSPECCIÓN', LABOR: 'Charla 5 Minutos y Ronda SST', ENCARGADO: 'Carmen Navarro', NOMBRE_ESTACION: 'ESTACIÓN SST', 'CODIGO BUS': 'BUS-01', RUTA: 'Ruta Expresa', HoraInicio: '05:30 AM', 'ULTIMO DIA': '2026-08-18' }
    ];

    const demoMarcaciones = [
      { RutTrabajador: '70112233', FechaHora: '2026-08-18 05:45:12', Puerta: 'Puerta Principal Fundo', NOMBRE_ESTACION: 'BUS-04', TIPO_ESTACION: 'BUS' },
      { RutTrabajador: '70334455', FechaHora: '2026-08-18 05:30:10', Puerta: 'Puerta Administrativa', NOMBRE_ESTACION: 'CAM-01', TIPO_ESTACION: 'BUS' },
      { RutTrabajador: '70667788', FechaHora: '2026-08-18 05:50:22', Puerta: 'Puerta Packing', NOMBRE_ESTACION: 'BUS-02', TIPO_ESTACION: 'BUS' },
      { RutTrabajador: '70889900', FechaHora: '2026-08-18 05:40:05', Puerta: 'Puerta Principal Fundo', NOMBRE_ESTACION: 'BUS-05', TIPO_ESTACION: 'BUS' },
      { RutTrabajador: '71001122', FechaHora: '2026-08-18 05:35:18', Puerta: 'Puerta Principal Fundo', NOMBRE_ESTACION: 'OFICINA SST', TIPO_ESTACION: 'FIJA' }
    ];

    const demoBuses = [
      { Predio: 'Fundo San José', Transportista: 'Transportes del Norte S.A.C.', 'Codigo Campo': 'BUS-04', Patente: 'BUS-04', 'Descripcion Ruta': 'Ruta 1 - Caserío Central' },
      { Predio: 'Planta Packing', Transportista: 'Servicios Verfrut', 'Codigo Campo': 'CAM-01', Patente: 'CAM-01', 'Descripcion Ruta': 'Ruta 2 - Sector Norte' },
      { Predio: 'Fundo Santa Rosa', Transportista: 'Transportes del Norte S.A.C.', 'Codigo Campo': 'BUS-02', Patente: 'BUS-02', 'Descripcion Ruta': 'Ruta 3 - Los Olivos' },
      { Predio: 'Fundo San José', Transportista: 'Transportes Rápidos', 'Codigo Campo': 'BUS-05', Patente: 'BUS-05', 'Descripcion Ruta': 'Ruta 1 - Caserío Central' }
    ];

    const demoCuadrillas = [
      { IDCUADRILLA: 1, 'Codigo Encargado': '000001', 'Nombre Encargado': 'CESAR ALBERTO MELGAR MARCHAN', Descripcion: 'MELGAR MARCHAN CESAR ALBERTO' },
      { IDCUADRILLA: 2, 'Codigo Encargado': '000051', 'Nombre Encargado': 'RICARDO ORLANDO RAMOS LOZADA', Descripcion: 'RAMOS LOZADA RICARDO ORLANDO' },
      { IDCUADRILLA: 5, 'Codigo Encargado': '000111', 'Nombre Encargado': 'CARLOS SILUPU ABAD', Descripcion: 'SILUPU ABAD CARLOS' },
      { IDCUADRILLA: 7, 'Codigo Encargado': '000055', 'Nombre Encargado': 'HENRY IPANAQUE VIERA', Descripcion: 'IPANAQUE VIERA HENRY' },
      { IDCUADRILLA: 202, 'Codigo Encargado': '000202', 'Nombre Encargado': 'JOSE ADALBERTO SUAREZ MAZA', Descripcion: 'SUAREZ MAZA JOSE ADALBERTO' }
    ];

    state.file1 = { data: demoTrabajadores, name: 'Demo_Trabajadores.xlsx', headers: Object.keys(demoTrabajadores[0]), keyCol: 'RutTrabajador', patCol: 'Ap.Paterno', matCol: 'Ap. Materno', nomCol: 'Nombre', sheetNames: ['Personal'], selectedSheet: 'Personal' };
    state.file2 = { data: demoUltimoDia, name: 'Demo_Ultimo_Dia_Labores.xlsx', headers: Object.keys(demoUltimoDia[0]), keyCol: 'RutTrabajador', actCol: 'ACTIVIDAD', laborCol: 'LABOR', turnoCol: 'HoraInicio', cuadrillaCol: 'IdCuadrilla', sheetNames: ['Labores'], selectedSheet: 'Labores' };
    state.file3 = { data: demoMarcaciones, name: 'Demo_Marcaciones.xlsx', headers: Object.keys(demoMarcaciones[0]), keyCol: 'RutTrabajador', nomEstCol: 'NOMBRE_ESTACION', tipoEstCol: 'TIPO_ESTACION', sheetNames: ['Marcaciones'], selectedSheet: 'Marcaciones' };
    state.file4 = { data: demoBuses, name: 'Demo_Buses_Rutas.xlsx', headers: Object.keys(demoBuses[0]), patenteCol: 'Patente', codBusCol: 'Codigo Campo', rutaCol: 'Descripcion Ruta', sheetNames: ['Buses'], selectedSheet: 'Buses' };
    state.file5 = { data: demoCuadrillas, name: 'Demo_Cuadrillas.xlsx', headers: Object.keys(demoCuadrillas[0]), idCuadrillaCol: 'IDCUADRILLA', descCol: 'Descripcion', nombreEncargadoCol: 'Nombre Encargado', sheetNames: ['Cuadrillas'], selectedSheet: 'Cuadrillas' };

    updateFileCardUI(1, { name: 'Demo_Trabajadores.xlsx', size: 16500 }, demoTrabajadores.length);
    updateFileCardUI(2, { name: 'Demo_Ultimo_Dia_Labores.xlsx', size: 18200 }, demoUltimoDia.length);
    updateFileCardUI(3, { name: 'Demo_Marcaciones.xlsx', size: 9800 }, demoMarcaciones.length);
    updateFileCardUI(4, { name: 'Demo_Buses_Rutas.xlsx', size: 12400 }, demoBuses.length);
    updateFileCardUI(5, { name: 'Demo_Cuadrillas.xlsx', size: 11200 }, demoCuadrillas.length);

    checkProcessingReadiness();
    showToast('Datos demo cargados con los 5 archivos listos para procesar.', 'success');
  }

  // Toast Notification Helper
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.2"><path d="M20 6L9 17l-5-5"/></svg>';
    } else if (type === 'error') {
      iconSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
    } else {
      iconSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
    }

    toast.innerHTML = `
      ${iconSvg}
      <div style="flex: 1;">${escapeHtml(message)}</div>
    `;

    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(12px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4200);
  }

  function formatBytes(bytes, decimals = 1) {
    if (!+bytes) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
