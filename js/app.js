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

  // Catálogo de Empresas para el Selector (Solo Verfrut y Rapel)
  const EMPRESAS_MAP = {
    '14': 'SOCIEDAD EXPORTADORA VERFRUT S. A. C.',
    '9': 'SOCIEDAD AGRÍCOLA RAPEL S. A. C.'
  };

  // Catálogo general de respaldo para resolución de nombres
  const ALL_KNOWN_EMPRESAS_MAP = {
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

  // Catálogo de Zonas y Fundos segmentado estrictamente por Empresa (evita cruce entre Rapel 9, Verfrut 14, etc.)
  const ZONAS_BY_EMPRESA_MAP = {
    '1': {
      '1': 'VIÑA LA GRUTA',
      '2': 'PLANTA VERFRUT RAPEL',
      '3': 'FUNDO MOLINA',
      '4': 'FUNDO EL DURAZNO',
      '5': 'FUNDO EL PORVENIR',
      '6': 'LA CEBADA',
      '7': 'FUNDO TUNCAHUE',
      '8': 'FUNDO QUILAMUTA',
      '9': 'NUEVA ESPERANZA',
      '10': 'FUNDO LA CABAÑA',
      '11': 'EL MACAL',
      '12': 'FUNDO LONCHA',
      '13': 'ADMINIST. GENERAL',
      '14': 'MAQUINARA PESADA',
      '15': 'PERSONAL RVD',
      '16': 'TINTORERA',
      '17': 'BODEGA EXPORTACION',
      '18': 'FUNDO EL CHILQUE',
      '19': 'PLANTA RAPEL TURNO NOCHE',
      '20': 'FDO EL PARRAL',
      '21': 'VALLE HERMOSO',
      '22': 'GERENCIA Y ADMINISTRACION CAMPOS',
      '23': 'MANZANARES',
      '24': 'LA PIEDAD',
      '25': 'EL SAUCE',
      '26': 'PLANTA EL NEVADO',
      '27': 'SANTA ISABEL',
      '28': 'PLANTA LOS LIRIOS',
      '29': 'PRESIDENCIA EJECUTIVA',
      '30': 'ADMINISTRACION LONGAVI',
      '31': 'SAN RAMIRO',
      '32': 'PLANTA VERFRUT 1',
      '33': 'PLANTA LOS LIRIOS 1',
      '34': 'MOLINA 1',
      '35': 'EL PORVENIR 1',
      '36': 'QUILAMUTA 1',
      '37': 'LA CABAÑA 1',
      '38': 'LONCHA 1',
      '39': 'CHILQUE 1',
      '40': 'COMBARBALA 1',
      '41': 'ADMINISTRACION LONGAVI 1',
      '42': 'EL DURAZNO 1',
      '43': 'FDO HUANCARA',
      '44': 'FUNDO LA CABAÑA (MOLINA)',
      '45': 'STA BERNARDITA Y ADRIANA',
      '46': 'FUNDO LAS MERCEDES',
      '47': 'ADMINISTRACION CAMPOS VICUÑA',
      '48': 'SANTA RAQUEL',
      '49': 'PLANTA ORO VERDE',
      '50': 'ORO VERDE',
      '51': 'FUNDO EL PAPAYO',
      '52': 'ADMINISTRACION ORO VERDE',
      '53': 'ADMINISTRACION GENERAL 1',
      '54': 'GERENCIA Y ADMINISTRACION CAMPOS 1',
      '55': 'VIVEROS',
      '56': 'PLANTA ORO VERDE (TN)',
      '57': 'FUNDO SANTA REBECA',
      '58': 'ADMINISTRACION ORO VERDE 1',
      '59': 'LAS VEGAS',
      '60': 'VIVEROS SUR',
      '61': 'FUNDO QUILICURA',
      '62': 'CAMPO PERO',
      '63': 'FUNDO COINCO',
      '64': 'SANTA DANIELA',
      '65': 'SAN FRANCISCO',
      '66': 'FUNDO QUILICURA 1',
      '67': 'LOS RISCOS',
    },
    '2': {
      '13': 'GERENCIA GENERAL',
    },
    '3': {
      '1': 'PEUMO ALTO',
      '2': 'PLANTA VERFRUT',
      '3': 'FUNDO MOLINA',
      '4': 'FUNDO EL DURAZNO',
      '5': 'FUNDO EL PORVENIR',
      '6': 'LA CEBADA',
      '7': 'FUNDO TUNCAHUE',
      '8': 'FUNDO QUILAMUTA',
      '9': 'FUNDO LONGAVI',
      '10': 'FUNDO LA CABAÑA',
      '11': 'EL MACAL',
      '12': 'FUNDO LONCHA',
      '13': 'ADMINISTRACION GENERAL',
      '14': 'MAQUINARIA PESADA',
      '15': 'PERSONAL RVD',
      '16': 'TINTORERA',
      '17': 'VIVERO',
      '18': 'FUNDO EL CHILQUE',
    },
    '4': {
      '8': 'FUNDO QUILAMUTA',
    },
    '5': {
      '1': 'HARAS MATANCILLA',
      '2': 'LAGO AZUL',
      '15': 'PERSONAL RVD',
      '46': 'FUNDO LAS MERCEDES',
    },
    '7': {
      '13': 'ADMINIST. GENERAL',
      '15': 'PERSONAL RVD',
      '55': 'FUNDO LAS BANDURRIAS',
      '59': 'LAS VEGAS',
    },
    '8': {
      '1': 'PRESIDENCIA',
      '2': 'PRODUCTORES TERCEROS',
      '3': 'GERENCIA VERFRUT',
      '4': 'CONTROL DE CALIDAD',
      '5': 'COMERCIALIZACION',
      '6': 'VERLOG',
      '7': 'FOREVER FRESH',
      '8': 'COMERCIALIZACION 1',
      '9': 'SUSTENTABILIDAD Y CERTIFICACION',
      '10': 'SUSTENTABILIDAD Y CERTIFICACION 1',
    },
    '9': {
      '11': 'LIMONES (OBREROS)',
      '17': 'TALLER GENERAL',
      '21': 'LIMONES',
      '34': 'PLANTA LIMONES',
      '35': 'PLANTA LIMONES (OBREROS)',
      '39': 'OPERACIONES CAMPO',
      '44': 'PLANTA PALTOS',
      '45': 'PLANTA PALTOS (OBREROS)',
      '46': 'SAN VIC L-V',
      '49': 'OPERACIONES CAMPO',
      '51': 'FUNDO EL PAPAYO',
      '52': 'LOS OLIVARES',
      '53': 'PLANTA RAPEL PERU',
      '54': 'GERENCIA GENERAL',
      '55': 'ADMINISTRACION RAPEL PERU',
      '56': 'SAN VICENTE',
      '57': 'ALAYO (OBREROS)',
      '58': 'APROA',
      '59': 'JARDIN',
      '61': 'FUNDO EL PAPAYO (OBREROS)',
      '62': 'LOS OLIVARES (OBREROS)',
      '63': 'PLANTA RAPEL (OBREROS)',
      '65': 'ADMINISTRACION (OBREROS)',
      '66': 'SAN VICENTE (OBREROS)',
      '67': 'ALAYO (ER)',
      '68': 'APROA (OBREROS)',
      '69': 'ALGARROBOS (OBREROS)',
      '70': 'ALGARROBOS',
      '71': 'FUNDO EL PAPAYO (ER)',
      '72': 'LOS OLIVARES (ER)',
      '73': 'PLANTA RAPEL PERU (ER)',
      '75': 'ADMINISTRACION RAPEL PERU (ER)',
      '76': 'SAN VICENTE (ER)',
      '77': 'ALGARROBOS (ER)',
      '78': 'APROA (ER)',
      '80': 'CAMPOS EXTERNOS',
      '81': 'EXPORTADORA',
      '89': 'OPERACIONES CAMPO (E)',
      '90': 'TERCEROS',
      '121': 'LIMONES',
      '149': 'OPERACIONES CAMPO',
      '153': 'PLANTA RAPEL PERU',
      '155': 'ADM SALUD OCUPACIONAL',
      '156': 'SAN VICENTE',
      '181': 'EXPORTADORA',
      '190': 'TERCEROS',
      '249': 'OPERACIONES CAMPO',
      '253': 'PLANTA RAPEL PERU',
      '255': 'ADMINISTRACION RAPEL',
      '290': 'TERCEROS',
      '755': 'ADMINISTRACION RAPEL PERU',
      '781': 'EXPORTADORA',
      '790': 'TERCEROS',
      '821': 'LIMONES',
      '849': 'OPERACIONES CAMPO',
      '851': 'FUNDO EL PAPAYO',
      '852': 'LOS OLIVARES',
      '853': 'PLANTA RAPEL PERU',
      '855': 'ADMINISTRACION RAPEL PERU',
      '856': 'SAN VICENTE',
      '858': 'APROA',
      '870': 'ALGARROBOS',
      '881': 'EXPORTADORA',
      '953': 'PLANTA RAPEL PERU',
    },
    '11': {
      '1': 'INMOBILIARIA',
    },
    '12': {
      '51': 'RAPEL SAC',
      '69': 'ALGARROBOS (OBREROS)',
      '70': 'ALGARROBOS  (ER)',
    },
    '14': {
      '13': 'ADMINISTRACION GENERAL',
      '30': 'SANTA ROSA 2 (OBREROS)',
      '31': 'PLANTA VERFRUT ARANDANOS (OBREROS)',
      '38': 'SAN RAFAEL (OBREROS)',
      '39': 'OPERACIONES CAMPO',
      '40': 'SANTA ROSA 2',
      '41': 'PLANTA VERFRUT ARANDANOS',
      '48': 'SAN RAFAEL',
      '49': 'OPERACIONES CAMPO',
      '50': 'OLIVARES BAJO',
      '51': 'ORGANICOS  SAN RAFAEL',
      '53': 'LOS VIEJITOS',
      '54': 'SANTA ROSA',
      '55': 'ADMINISTRACION VERFRUT PERU',
      '56': 'SANTA AMALIA',
      '57': 'PLANTA VERFRUT',
      '58': 'PUNTA ARENAS',
      '59': 'PUNTA ARENAS 2',
      '60': 'OLIVARES BAJO (OBREROS)',
      '61': 'SAN RAFAEL (OBREROS)',
      '62': 'LA OBRILLA (OBREROS)',
      '63': 'LOS VIEJITOS (OBREROS)',
      '64': 'SANTA ROSA (OBREROS)',
      '65': 'ADMINISTRACION (OBREROS)',
      '66': 'SANTA AMALIA (OBREROS)',
      '67': 'PLANTA VERFRUT (OBREROS)',
      '68': 'PUNTA ARENAS (OBREROS)',
      '69': 'PUNTA ARENAS 2',
      '71': 'SAN RAFAEL (ER)',
      '74': 'SANTA ROSA (ER)',
      '75': 'ADMINISTRACION VERFRUT PERU (ER)',
      '76': 'SANTA AMALIA',
      '78': 'PUNTA ARENAS',
      '80': 'CAMPOS EXTERNOS',
      '81': 'EXPORTADORA',
      '90': 'TERCEROS',
      '149': 'OPERACIONES CAMPO',
      '155': 'ADM SALUD OCUPACIONAL',
      '180': 'CAMPOS EXTERNOS',
      '241': 'PLANTA VERFRUT ARANDANOS',
      '249': 'OPERACIONES CAMPO',
      '255': 'ADMINISTRACION VERFRUT',
      '280': 'CAMPOS EXTERNOS',
      '755': 'ADMINISTRACION VERFRUT PERU',
      '840': 'SANTA ROSA 2',
      '841': 'PLANTA VERFRUT ARANDANOS',
      '848': 'SAN RAFAEL',
      '849': 'OPERACIONES CAMPO',
      '850': 'OLIVARES BAJO',
      '853': 'LOS VIEJITOS',
      '854': 'SANTA ROSA',
      '855': 'ADMINISTRACION VERFRUT PERU',
      '858': 'PUNTA ARENAS',
      '880': 'CAMPOS EXTERNOS',
    },
    '16': {
      '1': 'EL CARDAL',
      '2': 'EL CARDAL 2',
    },
    '17': {
      '1': 'OSORIO',
    },
    '19': {
      '1': 'FUNDO SANTA GRACIELA',
    },
    '20': {
      '1': 'ADMINISTRACION',
    },
    '21': {
      '1': 'COMBARBALA',
      '2': 'FUNDO EL GUINDO',
      '3': 'PERSONAL RVD',
      '4': 'FUNDO LOS TEJOS',
      '5': 'FUNDO LONTUE',
      '6': 'FUNDO MOLINA',
      '7': 'ADMINISTRACION GENERAL',
      '303': 'FUNDO LONTUE',
    },
    '22': {
      '1': 'BODEGA LOS LIRIOS',
    },
    '23': {
      '39': 'OPERACIONES CAMPO',
      '49': 'OPERACIONES CAMPO',
      '51': 'LA OBRILLA',
      '52': 'LA OBRILLA 2',
      '53': 'LA OBRILLA 3',
      '54': 'LA OBRILLA 4',
      '55': 'ADMINISTRACION AVANTI',
      '61': 'LA OBRILLA (OBREROS)',
      '62': 'LA OBRILLA 2 (OBREROS)',
      '63': 'LA OBRILLA 3 (OBREROS)',
      '64': 'LA OBRILLA 4 (OBREROS)',
      '71': 'LA OBRILLA (ER)',
      '849': 'OPERACIONES CAMPO',
      '851': 'LA OBRILLA',
    },
    '31': {
      '1': 'FUNDO BOMAREA',
      '10': 'GERENCIA',
      '11': 'RECURSOS HUMANOS',
      '12': 'COMERCIAL',
      '13': 'FINANZAS',
      '14': 'ADMINISTRACION',
      '15': 'TECNOLOGIAS DE LA INFORMACION',
      '16': 'CAMPAMENTO',
      '20': 'PLANTA BOMAREA',
      '21': 'FUNDO BOMAREA - OBREROS',
      '24': 'ADMINISTRACION - OBREROS',
      '30': 'PLANTA - OBREROS',
      '31': 'INVERSIONES TRABAJO EN CURSOS',
      '92': 'FUNDO BOMAREA -COSECHA',
      '93': 'VIVEROS BOMAREA',
      '94': 'CROTALARIA',
      '95': 'MAQUINARIA PROPIA',
      '96': 'MAQUINARIA ALQUILADA',
      '97': 'IMPLEMENTOS PROPIOS',
      '98': 'IMPLEMENTOS ALQUILADOS',
      '99': 'VEHICULOS PROPIOS',
      '910': 'VEHICULOS ALQUILADOS',
      '911': 'INVERSIONES- TRABAJOS EN CURSO',
      '913': 'LABORATORIO - INSECTOS BENEFIC',
      '915': 'GASTOS ADMINISTRATIVOS- FINANZ',
      '916': 'GASTOS DE VENTA',
      '917': 'OPERACION LOGISTICA',
      '918': 'GASTOS FINANCIEROS',
      '920': 'DIFERENCIA POR TC',
      '921': 'INGRESOS- SALES',
      '922': 'OTROS INGRESOS',
      '9100': 'GERENCIA',
      '9101': 'RECURSOS HUMANOS',
      '9102': 'COMERCIAL',
      '9103': 'FINANZAS',
      '9104': 'ADMINISTRACIÓN',
      '9105': 'TECNOLOGIA E INFORMATICA',
      '9106': 'CAMPAMENTO',
      '9107': 'Bomarea - Farm',
    },
    '32': {
      '2': 'FUNDO MOSQUETA - FARMS',
      '3': 'CALIDAD',
      '10': 'GERENCIA',
      '11': 'RECURSOS HUMANOS',
      '12': 'COMERCIAL',
      '13': 'GASTOS ADMINISTRATIVOS- FINANZAS',
      '14': 'ADMINISTRACION',
      '15': 'TECNOLOGIAS DE LA INFORMACION',
      '16': 'CAMPAMENTO',
      '17': 'GASTOS DE VENTA',
      '20': 'PLANTA BOMAREA',
      '21': 'FUNDO MOSQUETA - OBREROS',
      '24': 'ADMINISTRACION - OBREROS',
      '30': 'PLANTA - OBREROS',
      '92': 'FUNDO MOSQUETA - COSECHA',
      '93': 'MAQUINARIA PROPIA',
      '94': 'MAQUINARIA ALQUILADA',
      '95': 'IMPLEMENTOS PROPIOS',
      '96': 'IMPLEMENTOS ALQUILADOS',
      '97': 'VEHICULOS PROPIOS',
      '98': 'EQUIPOS MENORES',
      '99': 'SERVICIO DE PACKING PALTA',
      '910': 'TRABAJOS EN CURSO',
      '911': 'FUENTES DE AGUA',
      '913': 'GASTOS ADMINISTRATIVOS- FINANZ',
      '914': 'GASTOS DE VENTA',
      '915': 'OPERACIÓN LOGISTICA',
      '916': 'GASTOS FINANCIEROS',
      '917': 'DIFERENCIA POR TC',
      '921': 'INGRESOS-SALES',
      '922': 'OTROS INGRESOS',
      '923': 'GERENCIA',
    },
    '33': {
      '4': 'FUNDO PIRONA',
      '10': 'GERENCIA',
      '11': 'RECURSOS HUMANOS',
      '12': 'COMERCIAL',
      '13': 'GASTOS ADMINISTRATIVOS- FINANZAS',
      '14': 'ADMINISTRACION',
      '15': 'TECNOLOGIAS DE LA INFORMACION',
      '16': 'CAMPAMENTO',
      '17': 'GASTOS DE VENTA',
      '20': 'PLANTA BOMAREA',
      '21': 'FUNDO PIRONA - OBREROS',
      '24': 'ADMINISTRACION - OBREROS',
      '30': 'PLANTA - OBREROS',
      '92': 'FUNDO PIRONA -COSECHA',
      '93': 'MAQUINARIA PROPIA',
      '94': 'MAQUINARIA ALQUILADA',
      '95': 'IMPLEMENTOS PROPIOS',
      '96': 'IMPLEMENTOS ALQUILADOS',
      '97': 'VEHICULOS PROPIOS',
      '98': 'VEHICULOS ALQUILADOS',
      '99': 'EQUIPOS MENORES',
      '910': 'SERVICIO DE PACKING PALTA',
      '911': 'TRABAJOS EN CURSO',
      '912': 'FUENTES DE AGUA',
      '914': 'GASTOS ADMINISTRATIVOS- FINAN',
      '915': 'GASTOS DE VENTA',
      '916': 'OPERACIÓN LOGISTICA',
      '918': 'GASTOS FINANCIEROS',
      '919': 'DIFERENCIA POR TC',
      '921': 'INGRESOS - SALES',
      '922': 'OTROS INGRESOS',
      '923': 'GERENCIA',
    },
    '34': {
      '1': 'FUNDO BOMAREA',
      '10': 'GERENCIA',
      '11': 'RECURSOS HUMANOS',
      '12': 'COMERCIAL',
      '13': 'GASTOS ADMINISTRATIVOS- FINANZAS',
      '14': 'ADMINISTRACION',
      '15': 'TECNOLOGIAS DE LA INFORMACION',
      '16': 'CAMPAMENTO',
      '20': 'PLANTA BOMAREA',
      '21': 'FUNDO BOMAREA - OBREROS',
      '24': 'ADMINISTRACION - OBREROS',
      '30': 'PLANTA - OBREROS',
      '913': 'GASTOS ADMINISTRATIVOS- FINANZ',
      '916': 'GASTOS FINANCIEROS',
      '917': 'DIFERENCIA TC',
      '922': 'INGRESOS - SALES',
      '923': 'OTROS INGRESOS',
    },
    '35': {
      '3': 'FUNDO HEFEI',
      '10': 'GERENCIA',
      '11': 'RECURSOS HUMANOS',
      '12': 'COMERCIAL',
      '13': 'GASTOS ADMINISTRATIVOS- FINANZAS',
      '14': 'ADMINISTRACION',
      '15': 'TECNOLOGIAS DE LA INFORMACION',
      '16': 'CAMPAMENTO',
      '17': 'GASTOS DE VENTA',
      '20': 'PLANTA BOMAREA',
      '24': 'ADMINISTRACION - OBREROS',
      '30': 'PLANTA - OBREROS',
      '31': 'FUNDO HEFEI - OBREROS',
      '92': 'FUNDO HEFEI - COSECHA',
      '93': 'MAQUINARIA PROPIA',
      '94': 'MAQUINARIA ALQUILADA',
      '95': 'IMPLEMENTOS PROPIOS',
      '96': 'IMPLEMENTOS ALQUILADOS',
      '97': 'VEHICULOS PROPIOS',
      '98': 'VEHICULOS ALQUILADOS',
      '910': 'NEBUIZADORA',
      '911': 'EQUIPOS MENORES',
      '912': 'SERVICIO DE PACKING PALTA',
      '913': 'FILTRADOS',
      '915': 'GASTOS ADMINISTRATIVOS- FINANZ',
      '916': 'GASTOS DE VENTA',
      '917': 'OPERACION LOGISTICA',
      '918': 'GASTOS FINANCIEROS',
      '919': 'TRABAJOS EN CURSO',
      '920': 'DIFERENCIA POR TC',
      '922': 'OTROS INGRESOS',
      '923': 'INGRESOS - SALES',
      '924': 'GERENCIA',
    },
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
    'RUTA': ['ruta', 'linea', 'recorrido', 'rutatransporte', 'rutabus', 'rutavehiculo'],
    'TURNO': ['horainicio', 'horaingreso', 'horarioinicio', 'turno', 'horario', 'jornada', 'tipoturno'],
    'HASTA': ['ultimodia', 'ultimo dia', 'fechaultimodia', 'fecultdia', 'ultimodialaborado']
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
    filterEmpresa: '',
    filterCuartel: '',
    filterRuta: '',
    filterSinTransporte: false,
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
    btnLoadDemo: document.getElementById('nav-demo-data') || document.getElementById('btn-load-demo'),
    btnShortcuts: document.getElementById('btn-shortcuts'),
    btnHelp: document.getElementById('btn-help'),
    btnProcess: document.getElementById('btn-header-process') || document.getElementById('btn-process'),
    btnResetAll: document.getElementById('btn-reset-all'),
    btnExportExcel: document.getElementById('btn-header-export-excel') || document.getElementById('btn-export-excel'),
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

    // Results Section, Actions & Distribution
    resultsSection: document.getElementById('results-section'),
    btnExportExcelHeader: document.getElementById('btn-header-export-excel') || document.getElementById('btn-export-excel-header'),
    btnExportExcel: document.getElementById('btn-export-excel'),
    btnExportCsv: document.getElementById('btn-export-csv'),
    btnPrint: document.getElementById('btn-print') || document.getElementById('btn-print-table'),
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
    btnClearSearch: document.getElementById('btn-clear-search') || document.getElementById('btn-clear-filters'),
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

    // Header & Global Empresa Controls
    globalEmpresaSelect: document.getElementById('global-empresa-select'),
    globalEmpresaCustom: document.getElementById('global-empresa-custom'),
    empresaPickerContainer: document.getElementById('empresa-picker-container'),
    btnThemeToggle: document.getElementById('btn-theme-toggle'),
    btnSoundToggle: document.getElementById('btn-sound-toggle'),
    btnLoadAllSql: document.getElementById('btn-load-all-sql'),

    // Modal Sincronización Completa SQL (Sync All)
    modalSqlSyncAll: document.getElementById('modal-sql-sync-all'),
    btnCloseSqlSyncAll: document.getElementById('btn-close-sql-sync-all'),
    btnCancelSqlSyncAll: document.getElementById('btn-cancel-sql-sync-all'),
    formSqlSyncAll: document.getElementById('form-sql-sync-all'),
    btnSubmitSqlSyncAll: document.getElementById('btn-submit-sql-sync-all'),
    btnSyncAllCalcDates: document.getElementById('btn-sync-all-calc-dates'),
    btnSyncAllApplyMaster: document.getElementById('btn-sync-all-apply-master'),
    syncAllSummaryCount: document.getElementById('sync-all-summary-count'),

    syncAllMasterEmpresa: document.getElementById('sync-all-master-empresa'),
    syncAllMasterEmpresaCustom: document.getElementById('sync-all-master-empresa-custom'),
    syncAllMasterMes: document.getElementById('sync-all-master-mes'),
    syncAllMasterAnio: document.getElementById('sync-all-master-anio'),

    // Cards toggles & inputs
    syncAllInclude1: document.getElementById('sync-all-include-1'),
    syncAllP1Empresa: document.getElementById('sync-all-p1-empresa'),
    syncAllP1Activo: document.getElementById('sync-all-p1-activo'),
    syncAllP1Mes: document.getElementById('sync-all-p1-mes'),
    syncAllP1Anio: document.getElementById('sync-all-p1-anio'),
    syncAllP1Fechaini: document.getElementById('sync-all-p1-fechaini'),

    syncAllInclude2: document.getElementById('sync-all-include-2'),
    syncAllP2Empresa: document.getElementById('sync-all-p2-empresa'),
    syncAllP2Mes: document.getElementById('sync-all-p2-mes'),
    syncAllP2Anio: document.getElementById('sync-all-p2-anio'),

    syncAllInclude3: document.getElementById('sync-all-include-3'),
    syncAllP3Empresa: document.getElementById('sync-all-p3-empresa'),
    syncAllP3Sw: document.getElementById('sync-all-p3-sw'),
    syncAllP3Desde: document.getElementById('sync-all-p3-desde'),
    syncAllP3Hasta: document.getElementById('sync-all-p3-hasta'),

    syncAllInclude4: document.getElementById('sync-all-include-4'),
    syncAllP4Codpais: document.getElementById('sync-all-p4-codpais'),
    syncAllP4Empresa: document.getElementById('sync-all-p4-empresa'),
    syncAllP4Desde: document.getElementById('sync-all-p4-desde'),
    syncAllP4Hasta: document.getElementById('sync-all-p4-hasta'),

    syncAllInclude5: document.getElementById('sync-all-include-5'),
    syncAllP5Empresa: document.getElementById('sync-all-p5-empresa'),

    // Direct SQL Database Configuration Modal
    btnDbConfig: document.getElementById('btn-header-user-config') || document.getElementById('nav-config-bd') || document.getElementById('btn-db-config'),
    modalSqlDbConfig: document.getElementById('modal-sql-db-config'),
    btnCloseSqlDbConfig: document.getElementById('btn-close-sql-db-config'),
    btnCancelSqlDbConfig: document.getElementById('btn-cancel-sql-db-config'),
    formSqlDbConfig: document.getElementById('form-sql-db-config'),
    dbConfigServer: document.getElementById('db-config-server'),
    dbConfigDatabase: document.getElementById('db-config-database'),
    dbConfigUid: document.getElementById('db-config-uid'),
    dbConfigPwd: document.getElementById('db-config-pwd'),
    btnToggleDbPwd: document.getElementById('btn-toggle-db-pwd'),
    dbConfigWsid: document.getElementById('db-config-wsid'),
    dbConfigDriver: document.getElementById('db-config-driver'),
    dbConfigStatusBox: document.getElementById('db-config-status-box'),
    btnTestDbConfig: document.getElementById('btn-test-db-config'),
    btnSaveDbConfig: document.getElementById('btn-save-db-config'),
    btnResetDbConfig: document.getElementById('btn-reset-db-config'),

    btnLoadSql: document.getElementById('btn-load-sql'),
    btnLoadSqlHeader: document.getElementById('btn-header-sync-sql') || document.getElementById('btn-load-sql-header'),
    btnOpenSqlParams: document.getElementById('btn-open-sql-params'),
    modalSqlParams: document.getElementById('modal-sql-params'),
    btnCloseSqlParams: document.getElementById('btn-close-sql-params'),
    btnCancelSqlParams: document.getElementById('btn-cancel-sql-params'),
    formSqlParams: document.getElementById('form-sql-params'),
    dbStatusBadge: document.getElementById('statusbar-db-status') || document.getElementById('db-status-badge'),
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
    sqlParam3Desde: document.getElementById('sql-param-3-desde'),
    sqlParam3Hasta: document.getElementById('sql-param-3-hasta'),
    btnCalc3Days: document.getElementById('btn-calc-3days'),
    sqlParam3Empresa: document.getElementById('sql-param-3-empresa'),
    sqlParam3Sw: document.getElementById('sql-param-3-sw'),

    // Card 4 SQL Controls (Buses & Rutas - SPC_REGISTRO_RUTA)
    btnLoadSql4: document.getElementById('btn-load-sql-4'),
    btnOpenSqlParams4: document.getElementById('btn-open-sql-params-4'),
    modalSqlParams4: document.getElementById('modal-sql-params-4'),
    btnCloseSqlParams4: document.getElementById('btn-close-sql-params-4'),
    btnCancelSqlParams4: document.getElementById('btn-cancel-sql-params-4'),
    formSqlParams4: document.getElementById('form-sql-params-4'),
    sqlParam4Codpais: document.getElementById('sql-param-4-codpais'),
    sqlParam4Empresa: document.getElementById('sql-param-4-empresa'),
    sqlParam4Desde: document.getElementById('sql-param-4-desde'),
    sqlParam4Hasta: document.getElementById('sql-param-4-hasta'),

    // Card 5 SQL Controls (Cuadrillas)
    btnLoadSql5: document.getElementById('btn-load-sql-5'),

    // Toast Container
    toastContainer: document.getElementById('toast-container')
  };

  // Sistema de Notificación Sonora con Web Audio API (Cero dependencias)
  let soundEnabled = true;

  function playSuccessSound(type = 'chime') {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const now = ctx.currentTime;

      if (type === 'chime' || type === 'success') {
        // Timbre armónico de 3 notas brillantes (E5 -> A5 -> C#6)
        const notes = [
          { freq: 659.25, time: 0, dur: 0.35, gain: 0.15 },
          { freq: 880.00, time: 0.10, dur: 0.45, gain: 0.18 },
          { freq: 1108.73, time: 0.20, dur: 0.70, gain: 0.22 }
        ];

        notes.forEach(n => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(n.freq, now + n.time);
          gain.gain.setValueAtTime(0, now + n.time);
          gain.gain.linearRampToValueAtTime(n.gain, now + n.time + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + n.time + n.dur);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + n.time);
          osc.stop(now + n.time + n.dur);
        });
      } else if (type === 'step') {
        // Tono suave para pasos individuales o archivos cargados
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880.00, now);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.12, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.25);
      }
    } catch (e) {
      console.warn('Audio no disponible:', e);
    }
  }

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

  // Helper: Resuelve el ID numérico de Empresa (ej. '9', '14') a partir de string o número
  function resolveEmpresaId(empContext) {
    if (empContext !== null && empContext !== undefined && empContext !== '') {
      const str = String(empContext).trim();
      if (/^\d+$/.test(str)) return str;
      const matchNum = str.match(/^(\d+)\s*[-:]/);
      if (matchNum) return matchNum[1];
      const lower = str.toLowerCase();
      if (lower.includes('rapel')) return '9';
      if (lower.includes('verfrut') && (lower.includes('sac') || lower.includes('peru') || lower.includes('exportadora') || (!lower.includes('spa') && !lower.includes('chile')))) return '14';
      if (lower.includes('algarrobo')) return '12';
      if (lower.includes('avanti')) return '23';
      if (lower.includes('bomarea')) return '31';
      if (lower.includes('mosqueta')) return '32';
      if (lower.includes('pirona')) return '33';
      if (lower.includes('lefkada')) return '34';
      if (lower.includes('hefei')) return '35';
      if (lower.includes('porvenir')) return '1';
      if (lower.includes('durazno')) return '2';
      if (lower.includes('parrones')) return '3';
      if (lower.includes('quilamuta')) return '4';
      if (lower.includes('rvd')) return '5';
      if (lower.includes('pilares')) return '7';
      if (lower.includes('peñasco') || lower.includes('penasco')) return '19';
      if (lower.includes('lirios')) return '22';
      if (lower.includes('remanso')) return '21';
      if (lower.includes('sky')) return '20';
      if (lower.includes('faraleufu') || lower.includes('inmobiliaria')) return '11';
      if (lower.includes('pjm')) return '16';
      if (lower.includes('verceling')) return '17';
      if (lower.includes('chile') || lower.includes('spa')) return '8';
    }
    if (typeof getSelectedEmpresaId === 'function') {
      return getSelectedEmpresaId() || '14';
    }
    return '14';
  }

  // Limpia sufijos tipo "(JOR 8)", "(JOR 9.6)", "(9.6)", "( JOR 8)" del nombre de una zona
  function cleanZoneText(txt) {
    if (!txt) return '';
    return String(txt).replace(/\s*\(\s*(?:JOR\s*)?[\d\.]+\s*\)/gi, '').trim();
  }

  // Consulta el nombre de zona según la empresa específica
  function getZonaNameForEmpresa(empContext, zonaId) {
    if (!zonaId) return null;
    const cleanZId = String(zonaId).trim();
    const empId = resolveEmpresaId(empContext);

    // 1. Catálogo específico de la empresa de la fila
    if (ZONAS_BY_EMPRESA_MAP[empId] && ZONAS_BY_EMPRESA_MAP[empId][cleanZId]) {
      return ZONAS_BY_EMPRESA_MAP[empId][cleanZId];
    }

    // 2. Catálogo de la empresa seleccionada globalmente en la cabecera (si es distinta)
    const activeEmpId = typeof getSelectedEmpresaId === 'function' ? getSelectedEmpresaId() : null;
    if (activeEmpId && activeEmpId !== empId && ZONAS_BY_EMPRESA_MAP[activeEmpId] && ZONAS_BY_EMPRESA_MAP[activeEmpId][cleanZId]) {
      return ZONAS_BY_EMPRESA_MAP[activeEmpId][cleanZId];
    }

    return null;
  }

  // Helper: Sincroniza dinámicamente el catálogo de Zonas desde SQL Server para la empresa activa
  async function syncZonasCatalogFromSql(empresaId) {
    if (!empresaId) return;
    try {
      const idStr = String(empresaId).trim();
      const res = await fetch(`/api/zonas?idEmpresa=${idStr}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          if (!ZONAS_BY_EMPRESA_MAP[idStr]) ZONAS_BY_EMPRESA_MAP[idStr] = {};
          json.data.forEach(item => {
            const zid = String(item.IdZona !== undefined ? item.IdZona : '').trim();
            const znom = cleanZoneText(item.Nombre || '');
            if (zid && znom) {
              ZONAS_BY_EMPRESA_MAP[idStr][zid] = znom;
            }
          });
        }
      }
    } catch (e) {
      console.warn('No se pudo sincronizar catálogo dinámico de zonas:', e);
    }
  }

  // Formateador de Zona de Labores respetando la empresa de la fila y preservando descripciones reales
  function formatZonaValue(rawVal, empresaContext) {
    if (rawVal === null || rawVal === undefined || rawVal === '') return '';
    const strVal = String(rawVal).trim();
    if (!strVal || strVal === '(en blanco)' || strVal === '-' || strVal.toLowerCase() === 'null') return '';

    // Caso 1: Si ya empieza con número seguido de letras (ej. "54 GERENCIA GENERAL", "54 SANTA ROSA", "58 APROA")
    const match = strVal.match(/^(\d+)\s*[-:]?\s*([A-Za-zÁ-Úá-úñÑ].*)$/);
    if (match) {
      const numId = match[1];
      const textPart = cleanZoneText(match[2]);
      // Si ya tiene una descripción válida en los datos, PRESERVARLA SIEMPRE (nunca sobreescribir con otra empresa)
      if (textPart && textPart.toLowerCase() !== 'null' && textPart.toLowerCase() !== 'en blanco') {
        return `${numId} ${textPart}`.trim();
      }
      const catalogNom = getZonaNameForEmpresa(empresaContext, numId);
      return catalogNom ? `${numId} ${catalogNom}`.trim() : numId;
    }

    // Caso 2: Si es puramente numérico (ej. "54", "58", "853", "858")
    if (/^\d+$/.test(strVal)) {
      const catalogNom = getZonaNameForEmpresa(empresaContext, strVal);
      if (catalogNom) {
        return `${strVal} ${catalogNom}`.trim();
      }
      return strVal;
    }

    // Caso 3: Si es solo texto (ej. "GERENCIA GENERAL", "SANTA ROSA", "FUNDO EL PAPAYO")
    const cleanTxt = cleanZoneText(strVal);
    const empId = resolveEmpresaId(empresaContext);
    const cat = ZONAS_BY_EMPRESA_MAP[empId] || {};
    for (const [zid, znom] of Object.entries(cat)) {
      if (cleanHeader(znom) === cleanHeader(cleanTxt)) {
        return `${zid} ${znom}`.trim();
      }
    }

    return cleanTxt;
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
        // NUNCA cruzar 'ruta' con nombres, apellidos, trabajadores, ruts, vigencias u orígenes
        if (cleanAlias.includes('ruta') && (cleanKey.includes('vigente') || cleanKey.includes('periodo') || cleanKey.includes('contrato') || cleanKey.includes('rut') || cleanKey.includes('nombre') || cleanKey.includes('apell') || cleanKey.includes('trabajador') || cleanKey === 'origen' || cleanKey.includes('origen'))) continue;
        if ((cleanKey.includes('nombre') || cleanKey.includes('apell') || cleanKey.includes('trabajador') || cleanKey.includes('rut')) && cleanAlias.includes('ruta')) continue;

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

    // Fast Path O(1): Coincidencia directa en el objeto
    for (const alias of aliasList) {
      const v = row[alias];
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        return formatCellValue(v);
      }
    }

    const rowKeys = Object.keys(row);

    // Fast Path O(K): Coincidencia case-insensitive directa
    for (const alias of aliasList) {
      const aLow = alias.toLowerCase();
      for (const k of rowKeys) {
        if (k.toLowerCase() === aLow) {
          const v = row[k];
          if (v !== undefined && v !== null && String(v).trim() !== '') {
            return formatCellValue(v);
          }
        }
      }
    }

    // Pase 1: Coincidencia exacta normalizada
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
        // NUNCA cruzar 'ruta' con nombres, apellidos, trabajadores, ruts, vigencias u orígenes
        if (cleanAlias.includes('ruta') && (cleanKey.includes('vigente') || cleanKey.includes('periodo') || cleanKey.includes('contrato') || cleanKey.includes('rut') || cleanKey.includes('nombre') || cleanKey.includes('apell') || cleanKey.includes('trabajador') || cleanKey === 'origen' || cleanKey.includes('origen'))) continue;
        if ((cleanKey.includes('nombre') || cleanKey.includes('apell') || cleanKey.includes('trabajador') || cleanKey.includes('rut')) && cleanAlias.includes('ruta')) continue;

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

    if (targetCol === 'RUTA') {
      let rawRuta = extractFromRow(row2, ['ruta', 'linea', 'recorrido', 'rutatransporte', 'rutabus']) ||
                    extractFromRow(row1, ['ruta', 'linea', 'recorrido', 'rutatransporte', 'rutabus']);
      if (rawRuta) {
        const rLow = String(rawRuta).trim().toLowerCase();
        if (rLow === 'true' || rLow === 'false' || rLow === '0' || rLow === '1' || rLow === 'vigente' || rLow === 'no vigente' || rLow.includes('periodo') || rLow.includes('vigente/periodo')) {
          return '';
        }
        const apePat = String(row1 ? row1['Ap.Paterno'] || '' : '').toLowerCase().trim();
        const apeMat = String(row1 ? row1['Ap. Materno'] || '' : '').toLowerCase().trim();
        const nom = String(row1 ? row1['Nombre'] || '' : '').toLowerCase().trim();
        if ((apePat && rLow.includes(apePat)) || (apeMat && rLow.includes(apeMat)) || (nom && rLow.includes(nom))) {
          return '';
        }
        return rawRuta;
      }
      return '';
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
      if (!row2) return '';
      const ultimoDiaVal = extractFromRow(row2, ['ultimodia', 'ultimo dia', 'ultimo_dia', 'fechaultimodia', 'fecha_ultimo_dia', 'fecultdia', 'ultimodialaborado']);
      return ultimoDiaVal || '';
    }

    if (targetCol === 'Tiene Digitacion (jornal)') {
      return extractFromRow(row2, ['tienedigitacionjornal', 'tienedigitacion', 'digitacion', 'jornal', 'tienejornal', 'digitado', 'esjornal']) ||
             extractFromRow(row1, ['tienedigitacionjornal', 'tienedigitacion', 'digitacion', 'jornal', 'tienejornal', 'digitado', 'esjornal']);
    }

    if (targetCol === 'Zona Labores') {
      const act = row2 ? extractFromRow(row2, ['actividad', 'tipoactividad', 'motivo', 'situacion', 'labor', 'labores']) : '';
      const hasRegularLabor = act && !isAbsenceActivity(act);
      let rawZ = '';
      if (hasRegularLabor && row2) {
        rawZ = extractFromRow(row2, ['zona', 'zonalabores', 'zonadelabores', 'sede', 'fundo', 'campo', 'ubicacion', 'lugar', 'zonatrabajo']) ||
               extractFromRow(row1, ['zonalabores', 'zonadelabores', 'zona', 'sede', 'fundo', 'campo', 'centrocostopredio']);
      } else {
        rawZ = extractFromRow(row1, ['zonalabores', 'zonadelabores', 'zona', 'sede', 'fundo', 'campo', 'centrocostopredio']) ||
               (row2 ? extractFromRow(row2, ['zona', 'zonalabores', 'zonadelabores', 'sede', 'fundo', 'campo', 'ubicacion', 'lugar']) : '');
      }
      const empContext = extractFromRow(row1, ['empresa', 'idempresa', 'nomempresa', 'razonsocial', 'compania']) ||
                         (row2 ? extractFromRow(row2, ['empresa', 'idempresa', 'nomempresa', 'razonsocial', 'compania']) : '') ||
                         (typeof getSelectedEmpresaId === 'function' ? getSelectedEmpresaId() : '14');
      return formatZonaValue(rawZ, empContext);
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
    try { initTheme(); } catch (e) { console.error('Error initTheme:', e); }
    try { initializeDynamicDateParams(); } catch (e) { console.error('Error initializeDynamicDateParams:', e); }
    try { setupEventListeners(); } catch (e) { console.error('Error setupEventListeners:', e); }
    try { setupDropzones(); } catch (e) { console.error('Error setupDropzones:', e); }
    try { setupCardConfigToggles(); } catch (e) { console.error('Error setupCardConfigToggles:', e); }
    try { setupColumnVisibilityMenu(); } catch (e) { console.error('Error setupColumnVisibilityMenu:', e); }
    try { loadSqlDatabaseConfig(); } catch (e) { console.error('Error loadSqlDatabaseConfig:', e); }
    try { checkSqlConnection(); } catch (e) { console.error('Error checkSqlConnection:', e); }
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
    const badge = elements.dbStatusBadge || document.getElementById('statusbar-db-status') || document.getElementById('db-status-badge');
    if (!badge) return;
    try {
      const resp = await fetch('/api/test-sql');
      const data = await resp.json();
      if (data.success) {
        badge.innerHTML = '<span class="db-dot"></span> SQL Server Conectado';
        badge.classList.remove('disconnected');
        badge.title = 'SQL Server Conectado: Haz clic para cambiar contraseña o parámetros';
      } else {
        badge.innerHTML = '<span class="db-dot" style="background-color: var(--danger-500); box-shadow: 0 0 6px var(--danger-500);"></span> SQL Desconectado';
        badge.classList.add('disconnected');
        badge.title = `SQL Server Desconectado (${data.error || 'Verifica contraseña'}): Haz clic para configurar`;
      }
    } catch (e) {
      if (badge) {
        badge.innerHTML = '<span class="db-dot" style="background-color: var(--warning-500); box-shadow: 0 0 6px var(--warning-500);"></span> Modo Local';
        badge.title = 'Modo Local / Servidor de fondo no accesible';
      }
    }
  }

  // Load and populate SQL Database Configuration from backend
  async function loadSqlDatabaseConfig() {
    try {
      const resp = await fetch('/api/sql-config');
      if (!resp.ok) return;
      const data = await resp.json();
      if (data.success && data.config) {
        const c = data.config;
        const driverInput = elements.dbConfigDriver || document.getElementById('db-config-driver');
        const serverInput = elements.dbConfigServer || document.getElementById('db-config-server');
        const dbInput = elements.dbConfigDatabase || document.getElementById('db-config-database');
        const uidInput = elements.dbConfigUid || document.getElementById('db-config-uid');
        const pwdInput = elements.dbConfigPwd || document.getElementById('db-config-pwd');
        const wsidInput = elements.dbConfigWsid || document.getElementById('db-config-wsid');
        const trustedCheck = document.getElementById('db-config-trusted');
        const statusBox = elements.dbConfigStatusBox || document.getElementById('db-config-status-box');

        if (driverInput) driverInput.value = c.driver || '{SQL Server}';
        if (serverInput) serverInput.value = c.server || 'vfstbd01';
        if (dbInput) dbInput.value = c.database || 'bsis_rem_afr';
        if (uidInput) uidInput.value = c.uid || 'gpanta';
        if (pwdInput) pwdInput.value = c.pwd || '';
        if (wsidInput) wsidInput.value = c.wsid || 'VFRPTS03';
        if (trustedCheck) trustedCheck.checked = (c.trusted_connection === 'yes' || c.trusted_connection === true);
        if (statusBox) statusBox.style.display = 'none';

        // Actualizar visualmente la tarjeta de usuario en la barra lateral
        const userCardName = document.querySelector('#sidebar-user-card-clickable .user-name');
        if (userCardName && c.uid) {
          userCardName.textContent = c.uid === 'gpanta' ? 'Gabriel Panta' : c.uid;
        }
        const userCardOrg = document.querySelector('#sidebar-user-card-clickable .user-org');
        if (userCardOrg && c.uid) {
          userCardOrg.textContent = `Unifrutti (${c.uid})`;
        }
        document.querySelectorAll('.sql-server-name').forEach(el => {
          el.textContent = `${c.server || 'vfstbd01'} / ${c.database || 'bsis_rem_afr'}`;
        });

        if (elements.dbStatusBadge) {
          elements.dbStatusBadge.title = `Conexión SQL Server (${c.server} / ${c.database}): Haz clic para cambiar contraseña o parámetros`;
        }
      }
    } catch (e) {
      console.warn('No se pudo cargar la configuración de SQL:', e);
    }
  }

  // Test SQL Database Connection in real-time
  async function testSqlDatabaseConnection() {
    const btn = elements.btnTestDbConfig || document.getElementById('btn-test-db-config');
    const box = elements.dbConfigStatusBox || document.getElementById('db-config-status-box');
    const driverInput = elements.dbConfigDriver || document.getElementById('db-config-driver');
    const serverInput = elements.dbConfigServer || document.getElementById('db-config-server');
    const dbInput = elements.dbConfigDatabase || document.getElementById('db-config-database');
    const uidInput = elements.dbConfigUid || document.getElementById('db-config-uid');
    const pwdInput = elements.dbConfigPwd || document.getElementById('db-config-pwd');
    const wsidInput = elements.dbConfigWsid || document.getElementById('db-config-wsid');
    const trustedCheck = document.getElementById('db-config-trusted');

    const payload = {
      driver: driverInput ? driverInput.value : '{SQL Server}',
      server: serverInput ? serverInput.value.trim() : 'vfstbd01',
      database: dbInput ? dbInput.value.trim() : 'bsis_rem_afr',
      uid: uidInput ? uidInput.value.trim() : 'gpanta',
      pwd: pwdInput ? pwdInput.value : '',
      wsid: wsidInput ? wsidInput.value.trim() : 'VFRPTS03',
      trusted_connection: (trustedCheck && trustedCheck.checked) ? 'yes' : 'no'
    };

    try {
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<svg class="btn-icon process-spin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> <span>Probando...</span>';
      }
      if (box) {
        box.className = 'db-status-alert alert-loading';
        box.style.display = 'flex';
        box.innerHTML = '<span>⏳ Conectando con SQL Server y validando credenciales...</span>';
      }

      const resp = await fetch('/api/test-sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await resp.json();

      if (data.success) {
        if (box) {
          box.className = 'db-status-alert alert-success';
          box.innerHTML = `<span>✅ ${data.message}</span>`;
        }
        if (elements.dbStatusBadge) {
          elements.dbStatusBadge.innerHTML = '<span class="db-dot"></span> SQL Server Conectado';
          elements.dbStatusBadge.classList.remove('disconnected');
        }
        showToast('¡Prueba de conexión exitosa!', 'success');
        playSuccessSound('step');
      } else {
        if (box) {
          box.className = 'db-status-alert alert-error';
          box.innerHTML = `<span>❌ ${data.error || 'Error de conexión con SQL Server'}</span>`;
        }
        if (elements.dbStatusBadge) {
          elements.dbStatusBadge.innerHTML = '<span class="db-dot" style="background-color: var(--danger-500); box-shadow: 0 0 6px var(--danger-500);"></span> SQL Desconectado';
          elements.dbStatusBadge.classList.add('disconnected');
        }
        showToast('Error al conectar. Verifica servidor, usuario o contraseña.', 'error');
      }
    } catch (e) {
      if (box) {
        box.className = 'db-status-alert alert-error';
        box.innerHTML = `<span>❌ Error de red o servidor: ${e.message}</span>`;
      }
      showToast(`Error al probar conexión: ${e.message}`, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg> <span>🔌 Probar Conexión</span>';
      }
    }
  }

  // Save SQL Database Configuration permanently
  async function saveSqlDatabaseConfig() {
    const btn = elements.btnSaveDbConfig || document.getElementById('btn-save-db-config');
    const box = elements.dbConfigStatusBox || document.getElementById('db-config-status-box');
    const driverInput = elements.dbConfigDriver || document.getElementById('db-config-driver');
    const serverInput = elements.dbConfigServer || document.getElementById('db-config-server');
    const dbInput = elements.dbConfigDatabase || document.getElementById('db-config-database');
    const uidInput = elements.dbConfigUid || document.getElementById('db-config-uid');
    const pwdInput = elements.dbConfigPwd || document.getElementById('db-config-pwd');
    const wsidInput = elements.dbConfigWsid || document.getElementById('db-config-wsid');
    const trustedCheck = document.getElementById('db-config-trusted');

    const payload = {
      driver: driverInput ? driverInput.value : '{SQL Server}',
      server: serverInput ? serverInput.value.trim() : 'vfstbd01',
      database: dbInput ? dbInput.value.trim() : 'bsis_rem_afr',
      uid: uidInput ? uidInput.value.trim() : 'gpanta',
      pwd: pwdInput ? pwdInput.value : '',
      wsid: wsidInput ? wsidInput.value.trim() : 'VFRPTS03',
      trusted_connection: (trustedCheck && trustedCheck.checked) ? 'yes' : 'no'
    };

    if (!payload.server || !payload.database || !payload.uid) {
      showToast('⚠️ Por favor completa el servidor, base de datos y usuario.', 'warning');
      return;
    }

    try {
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<svg class="btn-icon process-spin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> <span>Guardando...</span>';
      }

      const resp = await fetch('/api/sql-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await resp.json();

      if (data.success) {
        showToast('💾 Configuración de SQL Server guardada correctamente.', 'success');
        playSuccessSound('chime');
        const modal = elements.modalSqlDbConfig || document.getElementById('modal-sql-db-config');
        if (modal) closeModal(modal);

        // Actualizar visualmente la interfaz
        const userCardName = document.querySelector('#sidebar-user-card-clickable .user-name');
        if (userCardName && payload.uid) {
          userCardName.textContent = payload.uid === 'gpanta' ? 'Gabriel Panta' : payload.uid;
        }
        const userCardOrg = document.querySelector('#sidebar-user-card-clickable .user-org');
        if (userCardOrg && payload.uid) {
          userCardOrg.textContent = `Unifrutti (${payload.uid})`;
        }
        document.querySelectorAll('.sql-server-name').forEach(el => {
          el.textContent = `${payload.server} / ${payload.database}`;
        });

        checkSqlConnection();
      } else {
        throw new Error(data.error || 'No se pudo guardar la configuración.');
      }
    } catch (e) {
      if (box) {
        box.className = 'db-status-alert alert-error';
        box.style.display = 'flex';
        box.innerHTML = `<span>❌ Error al guardar: ${e.message}</span>`;
      }
      showToast(`Error al guardar: ${e.message}`, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg> <span>💾 Guardar y Aplicar</span>';
      }
    }
  }

  // Reset to default config values in modal
  function resetSqlDatabaseConfig() {
    const driverInput = elements.dbConfigDriver || document.getElementById('db-config-driver');
    const serverInput = elements.dbConfigServer || document.getElementById('db-config-server');
    const dbInput = elements.dbConfigDatabase || document.getElementById('db-config-database');
    const uidInput = elements.dbConfigUid || document.getElementById('db-config-uid');
    const pwdInput = elements.dbConfigPwd || document.getElementById('db-config-pwd');
    const wsidInput = elements.dbConfigWsid || document.getElementById('db-config-wsid');
    const trustedCheck = document.getElementById('db-config-trusted');
    const statusBox = elements.dbConfigStatusBox || document.getElementById('db-config-status-box');

    if (driverInput) driverInput.value = '{SQL Server}';
    if (serverInput) serverInput.value = 'vfstbd01';
    if (dbInput) dbInput.value = 'bsis_rem_afr';
    if (uidInput) uidInput.value = 'gpanta';
    if (pwdInput) pwdInput.value = 'Pantagabriel#98';
    if (wsidInput) wsidInput.value = 'VFRPTS03';
    if (trustedCheck) trustedCheck.checked = true;
    if (statusBox) statusBox.style.display = 'none';
    showToast('Valores predeterminados cargados en el formulario. Haz clic en "Guardar y Aplicar" para confirmar.', 'info');
  }

    // Helper: Obtener lista de IDs de Empresas Seleccionadas (Multi-Empresa)
  function getSelectedEmpresas() {
    const listContainer = document.getElementById('quick-empresa-options-list');
    if (listContainer) {
      const checkedBoxes = listContainer.querySelectorAll('input[type="checkbox"]:checked');
      if (checkedBoxes.length > 0) {
        return Array.from(checkedBoxes).map(cb => cb.value);
      }
    }
    const hiddenSelect = document.getElementById('quick-param-empresa');
    if (hiddenSelect) {
      const selectedOpts = Array.from(hiddenSelect.selectedOptions || []);
      if (selectedOpts.length > 0) {
        return selectedOpts.map(o => o.value);
      }
      if (hiddenSelect.value) {
        return [hiddenSelect.value];
      }
    }
    const advSelect = document.getElementById('adv-param-empresa');
    if (advSelect) {
      const selectedOpts = Array.from(advSelect.selectedOptions || []);
      if (selectedOpts.length > 0) {
        return selectedOpts.map(o => o.value);
      }
    }
    return ['14'];
  }

  // Helper: Obtener ID de Empresa Activa (compatibilidad hacia atrás)
  function getSelectedEmpresaId() {
    const arr = getSelectedEmpresas();
    return arr[0] || '14';
  }

  // Helper: Obtener texto descriptivo de las empresas seleccionadas
  function getSelectedEmpresasLabel() {
    const list = getSelectedEmpresas();
    if (!list || list.length === 0) return 'Sin empresa seleccionada';
    if (list.length === 1) {
      const code = list[0];
      return EMPRESAS_MAP[code] ? `${code} - ${EMPRESAS_MAP[code]}` : `Empresa ${code}`;
    }
    if (list.length >= 2 && list.includes('14') && list.includes('9')) {
      return 'Verfrut + Rapel (Ambas)';
    }
    return `${list.length} Empresas (${list.join(', ')})`;
  }

  // Helper: Sincronizar selectores de Empresa en todos los modales y campos de consulta
  function syncEmpresaSelectors(empresaId) {
    const idStr = String(empresaId);
    if (elements.globalEmpresaSelect) {
      const hasOpt = Array.from(elements.globalEmpresaSelect.options).some(o => o.value === idStr);
      if (hasOpt) {
        elements.globalEmpresaSelect.value = idStr;
        if (elements.globalEmpresaCustom) elements.globalEmpresaCustom.style.display = 'none';
      } else {
        elements.globalEmpresaSelect.value = 'custom';
        if (elements.globalEmpresaCustom) {
          elements.globalEmpresaCustom.style.display = 'inline-block';
          elements.globalEmpresaCustom.value = idStr;
        }
      }
    }
    if (elements.syncAllMasterEmpresa) {
      const hasOpt = Array.from(elements.syncAllMasterEmpresa.options).some(o => o.value === idStr);
      if (hasOpt) {
        elements.syncAllMasterEmpresa.value = idStr;
        if (elements.syncAllMasterEmpresaCustom) elements.syncAllMasterEmpresaCustom.style.display = 'none';
      } else {
        elements.syncAllMasterEmpresa.value = 'custom';
        if (elements.syncAllMasterEmpresaCustom) {
          elements.syncAllMasterEmpresaCustom.style.display = 'inline-block';
          elements.syncAllMasterEmpresaCustom.value = idStr;
        }
      }
    }
    if (elements.sqlParamEmpresa) elements.sqlParamEmpresa.value = idStr;
    if (elements.sqlParam2Empresa) elements.sqlParam2Empresa.value = idStr;
    if (elements.sqlParam3Empresa) elements.sqlParam3Empresa.value = idStr;
    if (elements.sqlParam4Empresa) elements.sqlParam4Empresa.value = idStr;
    if (elements.syncAllP1Empresa) elements.syncAllP1Empresa.value = idStr;
    if (elements.syncAllP2Empresa) elements.syncAllP2Empresa.value = idStr;
    if (elements.syncAllP3Empresa) elements.syncAllP3Empresa.value = idStr;
    if (elements.syncAllP4Empresa) elements.syncAllP4Empresa.value = idStr;
    if (elements.syncAllP5Empresa) elements.syncAllP5Empresa.value = idStr;
  }

  // Helper: Consulta robusta a endpoints SQL con soporte para 1 o múltiples empresas
  async function fetchSqlWithMultiCompany(endpoint, params) {
    const queryParams = new URLSearchParams(params);
    try {
      const response = await fetch(`${endpoint}?${queryParams.toString()}`);
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data && result.data.length > 0) {
          return result;
        }
      }
    } catch (e) {
      console.warn(`Error en fetch directo a ${endpoint}:`, e);
    }

    // Fallback de contingencia: Si idEmpresa contiene varias empresas, consultar cada una en paralelo y unir
    const rawEmp = String(params.idEmpresa || '');
    const ids = rawEmp.split(',').map(x => x.trim()).filter(Boolean);
    if (ids.length > 1) {
      const promises = ids.map(id => {
        const singleParams = { ...params, idEmpresa: id };
        const q = new URLSearchParams(singleParams);
        return fetch(`${endpoint}?${q.toString()}`)
          .then(r => r.ok ? r.json() : null)
          .catch(() => null);
      });
      const results = await Promise.all(promises);
      const combinedData = [];
      let combinedHeaders = [];
      results.forEach((res, idx) => {
        if (res && res.success && Array.isArray(res.data)) {
          if (!combinedHeaders.length && res.headers) combinedHeaders = res.headers;
          const currentId = ids[idx];
          res.data.forEach(item => {
            if (!item.Empresa) {
              item.Empresa = EMPRESAS_MAP[currentId] || `EMPRESA ${currentId}`;
            }
            if (!item.IdEmpresa) {
              item.IdEmpresa = currentId;
            }
            combinedData.push(item);
          });
        }
      });

      if (combinedData.length > 0) {
        return {
          success: true,
          count: combinedData.length,
          headers: combinedHeaders,
          data: combinedData,
          params: params
        };
      }
    }

    // Si aún así no hay datos, lanzar error con detalle HTTP
    const finalResp = await fetch(`${endpoint}?${queryParams.toString()}`);
    if (!finalResp.ok) {
      const errData = await finalResp.json().catch(() => ({}));
      throw new Error(errData.error || `Error del servidor HTTP ${finalResp.status}`);
    }
    const finalJson = await finalResp.json();
    return finalJson;
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

      const activeEmp = (customParams && customParams.idEmpresa) || getSelectedEmpresas().join(',');
      showToast(`Conectando a base de datos vfstbd01 y consultando trabajadores (Empresas: ${activeEmp})...`, 'info');

      const now = new Date();
      const defMes = String(now.getMonth() + 1);
      const defAnio = String(now.getFullYear());
      const p = customParams || {
        idEmpresa: activeEmp,
        activo: elements.sqlParamActivo ? elements.sqlParamActivo.value : '1',
        mes: elements.sqlParamMes ? elements.sqlParamMes.value : defMes,
        anio: elements.sqlParamAnio ? elements.sqlParamAnio.value : defAnio,
        fechaini: (elements.sqlParamFechaini && elements.sqlParamFechaini.value.trim()) || ''
      };

      const result = await fetchSqlWithMultiCompany('/api/trabajadores', p);
      if (!result.success || !result.data || result.data.length === 0) {
        throw new Error(result.error || 'No se obtuvieron registros de trabajadores desde la base de datos.');
      }

      state.file1 = {
        data: result.data,
        name: `SQL Server (bsis_rem_afr) - Mes ${result.params.mes}/${result.params.anio} (${activeEmp})`,
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
      syncZonasCatalogFromSql(getSelectedEmpresaId());

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

      const activeEmp = (customParams && customParams.idEmpresa) || getSelectedEmpresas().join(',');
      showToast(`Consultando último día y labores en vfstbd01 (Empresas: ${activeEmp})...`, 'info');

      const p = customParams || {
        idEmpresa: activeEmp,
        mes: elements.sqlParam2Mes ? elements.sqlParam2Mes.value : '8',
        anio: elements.sqlParam2Anio ? elements.sqlParam2Anio.value : '2026'
      };

      const result = await fetchSqlWithMultiCompany('/api/ultimo-dia', p);
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

  // Load Buses & Rutas from SQL Server (Archivo 4 - SPC_REGISTRO_RUTA)
  async function loadBusesFromSqlServer(customParams = null) {
    const btn4 = elements.btnLoadSql4;
    try {
      if (btn4) {
        btn4.disabled = true;
        btn4.innerHTML = '<svg class="btn-icon process-spin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> <span>Consultando Rutas...</span>';
      }

      const activeEmp = (customParams && customParams.idEmpresa !== undefined) ? customParams.idEmpresa : getSelectedEmpresas().join(',');
      showToast(`Consultando buses y rutas en vfstbd01 (SPC_REGISTRO_RUTA - Empresas: ${activeEmp})...`, 'info');

      const p = customParams || {
        codPais: (elements.sqlParam4Codpais && elements.sqlParam4Codpais.value) || 'PE',
        desde: (elements.sqlParam4Desde && elements.sqlParam4Desde.value) || '16-08-2026',
        hasta: (elements.sqlParam4Hasta && elements.sqlParam4Hasta.value) || '31-08-2026',
        idEmpresa: activeEmp
      };

      const result = await fetchSqlWithMultiCompany('/api/buses', p);
      if (!result.success || !result.data) throw new Error(result.error || 'Error al obtener buses y rutas');

      state.file4 = {
        data: result.data,
        name: `SQL Server (SPC_REGISTRO_RUTA) - ${result.count.toLocaleString()} registros`,
        headers: result.headers,
        patenteCol: 'Patente',
        codBusCol: 'Codigo Campo',
        rutaCol: 'Descripcion Ruta',
        sheetNames: ['SQL_Result'],
        selectedSheet: 'SQL_Result'
      };

      autoDetectColumns(4);
      updateFileCardUI(4, { name: `SQL Server (Rutas) - ${result.count.toLocaleString()} registros`, size: result.count * 80 }, result.count);
      closeModal(elements.modalSqlParams4);
      showToast(`¡${result.count.toLocaleString()} registros de buses y rutas cargados (SPC_REGISTRO_RUTA)!`, 'success');
      return result;
    } catch (err) {
      console.error(err);
      showToast(`Error al consultar Buses y Rutas: ${err.message}`, 'error');
      throw err;
    } finally {
      if (btn4) {
        btn4.disabled = false;
        btn4.innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg> <span>Cargar desde SQL Server</span>';
      }
    }
  }

  // Load Cuadrillas from SQL Server (Archivo 5)
  async function loadCuadrillasFromSqlServer(customParams = null) {
    const btn5 = elements.btnLoadSql5;
    try {
      if (btn5) {
        btn5.disabled = true;
        btn5.innerHTML = '<svg class="btn-icon process-spin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> <span>Cargando...</span>';
      }

      const activeEmp = (customParams && customParams.idEmpresa) || getSelectedEmpresas().join(',');
      const result = await fetchSqlWithMultiCompany('/api/cuadrillas', { idEmpresa: activeEmp });
      if (!result.success || !result.data) throw new Error(result.error || 'Error al obtener cuadrillas');

      state.file5 = {
        data: result.data,
        name: `SQL Server (Cuadrillas) - ${result.count} cuadrillas (Empresas: ${activeEmp})`,
        headers: result.headers,
        idCuadrillaCol: 'IDCUADRILLA',
        descCol: 'Descripcion',
        nombreEncargadoCol: 'Nombre Encargado',
        sheetNames: ['SQL_Result'],
        selectedSheet: 'SQL_Result'
      };

      autoDetectColumns(5);
      updateFileCardUI(5, { name: `SQL Server (Cuadrillas) - ${result.count} cuadrillas`, size: result.count * 80 }, result.count);
      showToast(`¡${result.count} cuadrillas cargadas desde SQL Server (Empresas: ${activeEmp})!`, 'success');
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

  // Obtener rango de 3 días (hoy y 2 días hacia atrás)
  function getDefault3DaysRange() {
    const today = new Date();
    const d3 = new Date(today);
    d3.setDate(today.getDate() - 2);

    const pad = (n) => String(n).padStart(2, '0');
    const hasta = `${pad(today.getDate())}/${pad(today.getMonth() + 1)}/${today.getFullYear()}`;
    const desde = `${pad(d3.getDate())}/${pad(d3.getMonth() + 1)}/${d3.getFullYear()}`;
    return { desde, hasta };
  }

  // Load Marcaciones from SQL Server (Archivo 3 - SPC_LOGIN_MARCACIONES)
  async function loadMarcacionesFromSqlServer(customParams = null) {
    const btn3 = elements.btnLoadSql3;

    try {
      if (btn3) {
        btn3.disabled = true;
        btn3.innerHTML = '<svg class="btn-icon process-spin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> <span>Consultando Marcaciones...</span>';
      }

      const range = getDefault3DaysRange();
      const activeEmp = (customParams && customParams.idEmpresa) || getSelectedEmpresas().join(',');
      const p = customParams || {
        fechaDesde: range.desde,
        fechaHasta: range.hasta,
        idEmpresa: activeEmp,
        sw_contrato: (elements.sqlParam3Sw && elements.sqlParam3Sw.value) || '0'
      };

      showToast(`Consultando marcaciones (${p.fechaDesde} al ${p.fechaHasta}, Empresas: ${activeEmp}) en vfstbd01...`, 'info');

      const result = await fetchSqlWithMultiCompany('/api/marcaciones', p);
      if (!result.success || !result.data || result.data.length === 0) {
        throw new Error(result.error || 'No se obtuvieron registros de marcaciones.');
      }

      state.file3 = {
        data: result.data,
        name: `SQL Server (Marcaciones) - ${result.params.fechaDesde} al ${result.params.fechaHasta}`,
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
      showToast(`¡${result.count.toLocaleString()} marcaciones cargadas desde SQL Server!`, 'success');
      return result;
    } catch (err) {
      console.error(err);
      showToast(`Error al consultar Marcaciones: ${err.message}`, 'error');
      throw err;
    } finally {
      if (btn3) {
        btn3.disabled = false;
        btn3.innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg> <span>Cargar desde SQL Server</span>';
      }
    }
  }

  // Helper: Actualiza el contador y estados visuales en el modal de Sincronización Completa
  function updateSyncAllSummaryCount() {
    const checks = [
      { chk: elements.syncAllInclude1, card: document.getElementById('sync-card-1') },
      { chk: elements.syncAllInclude2, card: document.getElementById('sync-card-2') },
      { chk: elements.syncAllInclude3, card: document.getElementById('sync-card-3') },
      { chk: elements.syncAllInclude4, card: document.getElementById('sync-card-4') },
      { chk: elements.syncAllInclude5, card: document.getElementById('sync-card-5') },
    ];

    let count = 0;
    checks.forEach(item => {
      if (item.chk && item.chk.checked) {
        count++;
        if (item.card) item.card.classList.remove('disabled');
      } else if (item.card) {
        item.card.classList.add('disabled');
      }
    });

    if (elements.syncAllSummaryCount) {
      elements.syncAllSummaryCount.textContent = `${count} de 5 fuentes seleccionadas para sincronizar`;
    }
  }

  // Helper: Poblado inicial de parámetros en el modal de Sincronización Completa
  function populateSyncAllModalWithActiveSettings() {
    const empId = getSelectedEmpresaId();
    
    // Master Empresa
    if (elements.syncAllMasterEmpresa) {
      const hasOpt = Array.from(elements.syncAllMasterEmpresa.options).some(o => o.value === empId);
      if (hasOpt) {
        elements.syncAllMasterEmpresa.value = empId;
        if (elements.syncAllMasterEmpresaCustom) elements.syncAllMasterEmpresaCustom.style.display = 'none';
      } else {
        elements.syncAllMasterEmpresa.value = 'custom';
        if (elements.syncAllMasterEmpresaCustom) {
          elements.syncAllMasterEmpresaCustom.style.display = 'inline-block';
          elements.syncAllMasterEmpresaCustom.value = empId;
        }
      }
    }

    // Propagar a cards
    if (elements.syncAllP1Empresa) elements.syncAllP1Empresa.value = empId;
    if (elements.syncAllP2Empresa) elements.syncAllP2Empresa.value = empId;
    if (elements.syncAllP3Empresa) elements.syncAllP3Empresa.value = empId;
    if (elements.syncAllP4Empresa) elements.syncAllP4Empresa.value = empId;
    if (elements.syncAllP5Empresa) elements.syncAllP5Empresa.value = empId;

    // Mes & Año
    const activeMes = (elements.sqlParamMes && elements.sqlParamMes.value) || String(new Date().getMonth() + 1);
    const activeAnio = (elements.sqlParamAnio && elements.sqlParamAnio.value) || String(new Date().getFullYear());

    if (elements.syncAllMasterMes) elements.syncAllMasterMes.value = activeMes;
    if (elements.syncAllMasterAnio) elements.syncAllMasterAnio.value = activeAnio;
    if (elements.syncAllP1Mes) elements.syncAllP1Mes.value = activeMes;
    if (elements.syncAllP1Anio) elements.syncAllP1Anio.value = activeAnio;
    if (elements.syncAllP2Mes) elements.syncAllP2Mes.value = activeMes;
    if (elements.syncAllP2Anio) elements.syncAllP2Anio.value = activeAnio;

    // Fechas automáticas (Corte fin de mes y 3 días de marcaciones)
    calculateAndSetSyncAllDates(parseInt(activeMes, 10), parseInt(activeAnio, 10));

    // Resetear checkboxes a activados
    if (elements.syncAllInclude1) elements.syncAllInclude1.checked = true;
    if (elements.syncAllInclude2) elements.syncAllInclude2.checked = true;
    if (elements.syncAllInclude3) elements.syncAllInclude3.checked = true;
    if (elements.syncAllInclude4) elements.syncAllInclude4.checked = true;
    if (elements.syncAllInclude5) elements.syncAllInclude5.checked = true;

    updateSyncAllSummaryCount();
  }

  // Helper: Sincronizar selectores de empresa en toda la aplicación
  function syncAllCompanyInputs(empresaId) {
    if (!empresaId) return;
    const val = String(empresaId);
    const selectors = [
      '#quick-param-empresa',
      '#adv-param-empresa',
      '#sql-param-empresa',
      '#sql-param-2-empresa',
      '#sql-param-3-empresa',
      '#sql-param-4-empresa',
      '#sync-all-master-empresa',
      '#sync-all-p1-empresa',
      '#sync-all-p2-empresa',
      '#sync-all-p3-empresa',
      '#sync-all-p4-empresa',
      '#sync-all-p5-empresa',
      '#global-empresa-select'
    ];
    selectors.forEach(sel => {
      const el = document.querySelector(sel);
      if (el) el.value = val;
    });

    const chipEmp = document.getElementById('monitor-chip-empresa');
    if (chipEmp) {
      const qEmp = document.getElementById('quick-param-empresa');
      if (qEmp && qEmp.selectedIndex >= 0) {
        chipEmp.textContent = qEmp.options[qEmp.selectedIndex].text;
      } else {
        chipEmp.textContent = `Empresa ${val}`;
      }
    }
  }

  // Helper: Actualizar texto de chips informativos del monitor y toolbar
  function updateSyncChips() {
    const quickEmp = document.getElementById('quick-param-empresa');
    const quickMes = document.getElementById('quick-param-mes');
    const quickAnio = document.getElementById('quick-param-anio');
    const quickDias = document.getElementById('quick-param-dias');

    const chipEmp = document.getElementById('monitor-chip-empresa');
    const chipPer = document.getElementById('monitor-chip-periodo');
    const chipDias = document.getElementById('monitor-chip-dias');

    if (chipEmp) {
      chipEmp.textContent = getSelectedEmpresasLabel();
    }
    if (chipPer && quickMes && quickAnio) {
      const mesName = (quickMes.selectedIndex >= 0) ? quickMes.options[quickMes.selectedIndex].text : `Mes ${quickMes.value}`;
      chipPer.textContent = `${mesName} / ${quickAnio.value}`;
    }
    if (chipDias && quickDias && quickDias.selectedIndex >= 0) {
      chipDias.textContent = quickDias.options[quickDias.selectedIndex].text;
    }
  }

  // Helper: Cálculo de fechas de corte y rangos por mes/año
  function calculateAndSetSyncAllDates(mesNum, anioNum) {
    mesNum = parseInt(mesNum, 10);
    anioNum = parseInt(anioNum, 10);
    if (isNaN(mesNum) || isNaN(anioNum)) return;
    
    // Calcular último día del mes de forma matemática exacta
    const lastDay = new Date(anioNum, mesNum, 0).getDate();
    const pad = (n) => String(n).padStart(2, '0');

    const fechaini = `${pad(lastDay)}/${pad(mesNum)}/${anioNum}`;
    if (elements.syncAllP1Fechaini) elements.syncAllP1Fechaini.value = fechaini;
    if (elements.sqlParamFechaini) elements.sqlParamFechaini.value = fechaini;
    const advFechaini = document.getElementById('adv-param-fechaini');
    if (advFechaini) advFechaini.value = fechaini;

    // Rango de 3 días para marcaciones (Hoy y 2 días atrás)
    const range3d = getDefault3DaysRange();
    if (elements.syncAllP3Desde) elements.syncAllP3Desde.value = range3d.desde;
    if (elements.syncAllP3Hasta) elements.syncAllP3Hasta.value = range3d.hasta;
    if (elements.syncAllP4Desde) elements.syncAllP4Desde.value = range3d.desde;
    if (elements.syncAllP4Hasta) elements.syncAllP4Hasta.value = range3d.hasta;
    if (elements.sqlParam3Desde) elements.sqlParam3Desde.value = range3d.desde;
    if (elements.sqlParam3Hasta) elements.sqlParam3Hasta.value = range3d.hasta;
  }

  // Detección e inicialización dinámica del Mes, Año y Parámetros en tiempo real
  function initializeDynamicDateParams() {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const quickMes = document.getElementById('quick-param-mes');
    const quickAnio = document.getElementById('quick-param-anio');
    if (quickMes) quickMes.value = String(currentMonth);
    if (quickAnio) quickAnio.value = String(currentYear);

    const advMes = document.getElementById('adv-param-mes');
    const advAnio = document.getElementById('adv-param-anio');
    if (advMes) advMes.value = String(currentMonth);
    if (advAnio) advAnio.value = String(currentYear);

    if (elements.sqlParamMes) elements.sqlParamMes.value = String(currentMonth);
    if (elements.sqlParamAnio) elements.sqlParamAnio.value = String(currentYear);
    if (elements.sqlParam2Mes) elements.sqlParam2Mes.value = String(currentMonth);
    if (elements.sqlParam2Anio) elements.sqlParam2Anio.value = String(currentYear);

    if (elements.syncAllMasterMes) elements.syncAllMasterMes.value = String(currentMonth);
    if (elements.syncAllMasterAnio) elements.syncAllMasterAnio.value = String(currentYear);
    if (elements.syncAllP1Mes) elements.syncAllP1Mes.value = String(currentMonth);
    if (elements.syncAllP1Anio) elements.syncAllP1Anio.value = String(currentYear);
    if (elements.syncAllP2Mes) elements.syncAllP2Mes.value = String(currentMonth);
    if (elements.syncAllP2Anio) elements.syncAllP2Anio.value = String(currentYear);

    calculateAndSetSyncAllDates(currentMonth, currentYear);
    updateSyncChips();
  }

  // Helper: Ejecuta la sincronización en paralelo con los parámetros específicos de cada consulta
  async function executeCustomParallelSync(options) {
    const { do1, do2, do3, do4, do5, p1, p2, p3, p4, p5 } = options;
    const btnAll = elements.btnLoadAllSql;
    
    try {
      if (btnAll) {
        btnAll.disabled = true;
        btnAll.innerHTML = '<svg class="btn-icon process-spin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> <span>Sincronizando Fuentes...</span>';
      }

      const activeTasks = [];
      const taskNames = [];

      if (do1) { activeTasks.push(loadFromSqlServer(p1)); taskNames.push('Trabajadores'); }
      if (do2) { activeTasks.push(loadUltimoDiaFromSqlServer(p2)); taskNames.push('Labores'); }
      if (do3) { activeTasks.push(loadMarcacionesFromSqlServer(p3)); taskNames.push('Marcaciones'); }
      if (do4) { activeTasks.push(loadBusesFromSqlServer(p4)); taskNames.push('Buses y Rutas'); }
      if (do5) { activeTasks.push(loadCuadrillasFromSqlServer(p5)); taskNames.push('Cuadrillas'); }

      showToast(`⚡ Sincronizando ${activeTasks.length} fuentes seleccionadas desde SQL Server (Empresa ${p1.idEmpresa || getSelectedEmpresaId()})...`, 'info');

      const results = await Promise.allSettled(activeTasks);

      const successful = results.filter(r => r.status === 'fulfilled').length;
      checkProcessingReadiness();

      if (successful > 0) {
        playSuccessSound('chime');
        showToast(`🎉 ¡${successful} de ${activeTasks.length} fuentes sincronizadas con éxito! Consolidando...`, 'success');
        setTimeout(() => {
          if (state.file1.data && state.file2.data && state.file3.data) {
            handleProcessData();
          }
        }, 350);
      } else {
        showToast('❌ Ocurrieron errores al sincronizar las fuentes desde SQL Server.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast(`Error durante la sincronización: ${err.message}`, 'error');
    } finally {
      if (btnAll) {
        btnAll.disabled = false;
        btnAll.innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg> <span>⚡ Sincronizar Todo (SQL)</span>';
      }
    }
  }

    // Load All Sources from SQL Server con Monitor de Avance en Vivo y Gestión de Parámetros
  async function loadAllFromSqlServer() {
    const btnHeader = document.getElementById('btn-header-sync-sql') || elements.btnLoadSqlHeader;
    const btnAll = elements.btnLoadAllSql;
    const statusText = document.getElementById('sync-status-text');

    // Validación de protocolo
    if (window.location.protocol === 'file:') {
      if (statusText) {
        statusText.innerHTML = '<span style="color:#eab308;font-weight:600;">⚠️ Para sincronizar en vivo con SQL Server (vfstbd01), ejecute ConsolidadorRRHH.exe</span>';
      }
      showToast('Para sincronizar en tiempo real con SQL Server, por favor inicie la aplicación desde ConsolidadorRRHH.exe. También puede usar "🧪 Cargar Datos Demo" para operar offline.', 'warning', 7000);
      return;
    }

    // Modal del Monitor de Avance
    const modalMonitor = document.getElementById('modal-sync-live-monitor');
    const chipEmpresa = document.getElementById('monitor-chip-empresa');
    const chipPeriodo = document.getElementById('monitor-chip-periodo');
    const chipDias = document.getElementById('monitor-chip-dias');
    const monitorOverall = document.getElementById('sync-monitor-overall-status');
    const monitorPct = document.getElementById('sync-monitor-pct');
    const monitorFill = document.getElementById('sync-monitor-fill');
    const monitorTimer = document.getElementById('sync-monitor-timer');
    const btnViewResults = document.getElementById('btn-sync-monitor-view-results');
    const btnCloseMonitor = document.getElementById('btn-close-sync-monitor');

    // Obtener parámetros activos desde la barra rápida o los selectores
    const selEmp = document.getElementById('quick-param-empresa') || elements.globalEmpresaSelect;
    const selMes = document.getElementById('quick-param-mes') || elements.sqlParamMes;
    const inputAnio = document.getElementById('quick-param-anio') || elements.sqlParamAnio;
    const selDias = document.getElementById('quick-param-dias');

    const activeEmpList = getSelectedEmpresas();
    const activeEmpParam = activeEmpList.join(',');
    const activeEmpText = getSelectedEmpresasLabel();
    const activeMes = (selMes && selMes.value) ? selMes.value : '8';
    const activeMesText = (selMes && selMes.options && selMes.selectedIndex >= 0) ? selMes.options[selMes.selectedIndex].text : `Mes ${activeMes}`;
    const activeAnio = (inputAnio && inputAnio.value) ? inputAnio.value : '2026';
    const activeDias = (selDias && selDias.value) ? parseInt(selDias.value) : 3;

    // Calcular fecha corte para SPC_FICHA_TRABAJADOR
    const mNum = parseInt(activeMes, 10) || (new Date().getMonth() + 1);
    const yNum = parseInt(activeAnio, 10) || new Date().getFullYear();
    const lastDay = new Date(yNum, mNum, 0).getDate();
    const pad = (n) => String(n).padStart(2, '0');
    const fechainiCorte = `${pad(lastDay)}/${pad(mNum)}/${yNum}`;

    // Actualizar chips informativos en el modal
    if (chipEmpresa) chipEmpresa.textContent = activeEmpText;
    if (chipPeriodo) chipPeriodo.textContent = `${activeMesText} / ${activeAnio}`;
    if (chipDias) chipDias.textContent = `Últimos ${activeDias} días`;

    // Helper para actualizar estado de un paso en el modal
    function setStepProgress(stepNum, status, badgeText, metaText) {
      const stepRow = document.getElementById(`sync-step-${stepNum}`);
      const iconEl = document.getElementById(`sync-step-icon-${stepNum}`);
      const badgeEl = document.getElementById(`sync-step-badge-${stepNum}`);
      const metaEl = document.getElementById(`sync-step-meta-${stepNum}`);

      if (stepRow) {
        stepRow.className = `sync-step-item ${status}`;
      }
      if (iconEl) {
        if (status === 'running') {
          iconEl.innerHTML = '<svg class="process-spin-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0284c7" stroke-width="2.5"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>';
        } else if (status === 'completed') {
          iconEl.innerHTML = '<span style="color:#16a34a; font-size: 1.1rem; font-weight: bold;">✓</span>';
        } else if (status === 'error') {
          iconEl.innerHTML = '<span style="color:#dc2626; font-size: 1.1rem; font-weight: bold;">✗</span>';
        } else {
          iconEl.innerHTML = '<span style="color:#94a3b8; font-size: 0.9rem;">⚪</span>';
        }
      }
      if (badgeEl) {
        badgeEl.textContent = badgeText;
        badgeEl.className = `sync-step-badge ${status === 'running' ? 'running' : status === 'completed' ? 'done' : status === 'error' ? 'error' : ''}`;
      }
      if (metaEl && metaText) {
        metaEl.textContent = metaText;
      }
    }

    // Helper para actualizar barra general
    function setOverallProgress(pct, message) {
      if (monitorPct) monitorPct.textContent = `${pct}%`;
      if (monitorFill) monitorFill.style.width = `${pct}%`;
      if (monitorOverall) monitorOverall.textContent = message;
      if (statusText) statusText.innerHTML = `<span style="color:#0284c7;font-weight:600;">⏳ [${pct}%] ${message}</span>`;
    }

    // Resetear los 5 pasos
    for (let s = 1; s <= 5; s++) {
      setStepProgress(s, 'pending', 'En espera');
    }
    if (btnViewResults) btnViewResults.style.display = 'none';
    setOverallProgress(5, 'Iniciando conexión con base de datos vfstbd01...');

    // Abrir modal de avance visual
    if (modalMonitor) openModal(modalMonitor);

    // Timer de tiempo transcurrido
    const startTime = Date.now();
    const timerInterval = setInterval(() => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      if (monitorTimer) monitorTimer.textContent = `Tiempo transcurrido: ${elapsed}s`;
    }, 100);

    const spinSvg = '<svg class="btn-icon process-spin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>';
    const defaultHeaderBtnHtml = '<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg> <span>⚡ Sincronizar SQL</span>';

    try {
      if (btnHeader) {
        btnHeader.disabled = true;
        btnHeader.innerHTML = `${spinSvg} <span>Sincronizando...</span>`;
      }
      if (btnAll) {
        btnAll.disabled = true;
        btnAll.innerHTML = `${spinSvg} <span>Sincronizando 5 Fuentes...</span>`;
      }

      // Iniciar las 5 consultas en PARALELO para máxima velocidad
      for (let s = 1; s <= 5; s++) {
        setStepProgress(s, 'running', 'Consultando...');
      }
      setOverallProgress(20, 'Consultando las 5 fuentes SQL en paralelo desde vfstbd01...');

      let completedTasks = 0;
      const updateParallelProgress = () => {
        completedTasks++;
        const pct = Math.min(20 + completedTasks * 15, 90);
        setOverallProgress(pct, `Consultando fuentes SQL en paralelo... (${completedTasks}/5 listas)`);
      };

      // Tarea 1: Trabajadores Activos
      const task1 = loadFromSqlServer({
        idEmpresa: activeEmpParam,
        activo: '1',
        mes: activeMes,
        anio: activeAnio,
        fechaini: fechainiCorte
      }).then(r1 => {
        const cnt1 = (r1 && r1.count) || (state.file1.data ? state.file1.data.length : 0);
        setStepProgress(1, 'completed', `${cnt1.toLocaleString()} trab.`, `${cnt1.toLocaleString()} trabajadores activos cargados`);
        updateParallelProgress();
        return r1;
      }).catch(e1 => {
        console.warn('Error en Trabajadores:', e1);
        setStepProgress(1, 'error', 'Error', e1.message);
        updateParallelProgress();
        return null;
      });

      // Tarea 2: Labores y Asistencia
      const task2 = loadUltimoDiaFromSqlServer({
        idEmpresa: activeEmpParam,
        mes: activeMes,
        anio: activeAnio
      }).then(r2 => {
        const cnt2 = (r2 && r2.count) || (state.file2.data ? state.file2.data.length : 0);
        setStepProgress(2, 'completed', `${cnt2.toLocaleString()} labores`, `${cnt2.toLocaleString()} registros de labores cargados`);
        updateParallelProgress();
        return r2;
      }).catch(e2 => {
        console.warn('Error en Labores:', e2);
        setStepProgress(2, 'error', 'Error', e2.message);
        updateParallelProgress();
        return null;
      });

      // Tarea 3: Marcaciones Biométricas
      const task3 = loadMarcacionesFromSqlServer({
        idEmpresa: activeEmpParam,
        dias: activeDias,
        sw_contrato: '0'
      }).then(r3 => {
        const cnt3 = (r3 && r3.count) || (state.file3.data ? state.file3.data.length : 0);
        setStepProgress(3, 'completed', `${cnt3.toLocaleString()} marc.`, `${cnt3.toLocaleString()} marcaciones biométricas cargadas`);
        updateParallelProgress();
        return r3;
      }).catch(e3 => {
        console.warn('Error en Marcaciones:', e3);
        setStepProgress(3, 'error', 'Error', e3.message);
        updateParallelProgress();
        return null;
      });

      // Tarea 4: Buses y Rutas
      const task4 = loadBusesFromSqlServer({
        idEmpresa: activeEmpParam,
        codPais: 'PE'
      }).then(r4 => {
        const cnt4 = (r4 && r4.count) || (state.file4.data ? state.file4.data.length : 0);
        setStepProgress(4, 'completed', `${cnt4.toLocaleString()} rutas`, `${cnt4.toLocaleString()} registros de transporte cargados`);
        updateParallelProgress();
        return r4;
      }).catch(e4 => {
        console.warn('Error en Buses:', e4);
        setStepProgress(4, 'error', 'Error', e4.message);
        updateParallelProgress();
        return null;
      });

      // Tarea 5: Cuadrillas
      const task5 = loadCuadrillasFromSqlServer({
        idEmpresa: activeEmpParam
      }).then(r5 => {
        const cnt5 = (r5 && r5.count) || (state.file5.data ? state.file5.data.length : 0);
        setStepProgress(5, 'completed', `${cnt5.toLocaleString()} cuad.`, `${cnt5.toLocaleString()} cuadrillas activas cargadas`);
        updateParallelProgress();
        return r5;
      }).catch(e5 => {
        console.warn('Error en Cuadrillas:', e5);
        setStepProgress(5, 'error', 'Error', e5.message);
        updateParallelProgress();
        return null;
      });

      // Esperar a que las 5 consultas en paralelo terminen
      await Promise.allSettled([task1, task2, task3, task4, task5]);

      // ==========================================
      // FINALIZACIÓN Y CRUCE AUTOMÁTICO
      // ==========================================
      setOverallProgress(95, 'Consolidando y procesando cruce de 23 campos...');
      // Ceder brevemente el control al navegador para actualizar la barra visual
      await new Promise(resolve => setTimeout(resolve, 50));
      checkProcessingReadiness();

      if (state.file1.data && state.file1.data.length > 0) {
        handleProcessData();
        playSuccessSound('chime');

        const totalCons = state.consolidatedData ? state.consolidatedData.length : state.file1.data.length;
        if (monitorOverall) {
          monitorOverall.innerHTML = `<span style="color:#16a34a; font-weight:700;">✓ ¡Sincronización y cruce completados! ${totalCons.toLocaleString()} registros consolidados en tabla.</span>`;
        }
        if (statusText) {
          statusText.innerHTML = `<span style="color:#16a34a; font-weight:600;">✓ Sincronizado desde SQL Server (${totalCons.toLocaleString()} trabajadores consolidados en ${activeEmpText})</span>`;
        }
        showToast(`🎉 ¡Sincronización y cruce completados! ${totalCons.toLocaleString()} trabajadores consolidados.`, 'success');

        // Cerrar automáticamente el monitor después de 1 segundo para mostrar directamente la tabla de resultados
        setTimeout(() => {
          if (modalMonitor) closeModal(modalMonitor);
          const tbl = document.getElementById('consolidated-table');
          if (tbl) tbl.scrollIntoView({ behavior: 'smooth' });
        }, 1100);

        if (btnViewResults) {
          btnViewResults.style.display = 'inline-flex';
          btnViewResults.onclick = () => {
            if (modalMonitor) closeModal(modalMonitor);
            const tbl = document.getElementById('consolidated-table');
            if (tbl) tbl.scrollIntoView({ behavior: 'smooth' });
          };
        }
      } else {
        if (monitorOverall) {
          monitorOverall.innerHTML = '<span style="color:#dc2626; font-weight:700;">✗ No se obtuvieron registros de trabajadores. Verifique los parámetros.</span>';
        }
        showToast('No se obtuvieron registros de trabajadores. Verifique empresa y periodo.', 'error');
      }
    } catch (err) {
      console.error('Error durante loadAllFromSqlServer:', err);
      if (monitorOverall) {
        monitorOverall.innerHTML = `<span style="color:#dc2626; font-weight:700;">✗ Error de conexión SQL: ${err.message}</span>`;
      }
      showToast(`Error al sincronizar con SQL Server: ${err.message}`, 'error');
    } finally {
      clearInterval(timerInterval);
      const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      if (monitorTimer) monitorTimer.textContent = `Tiempo total: ${totalElapsed}s`;

      if (btnHeader) {
        btnHeader.disabled = false;
        btnHeader.innerHTML = defaultHeaderBtnHtml;
      }
      if (btnAll) {
        btnAll.disabled = false;
        btnAll.innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg> <span>⚡ Sincronizar Todo (SQL)</span>';
      }

      if (btnCloseMonitor) {
        btnCloseMonitor.onclick = () => {
          if (modalMonitor) closeModal(modalMonitor);
        };
      }
    }
  }

  // Setup Event Listeners
  function setupEventListeners() {
    if (elements.btnProcess) elements.btnProcess.addEventListener('click', handleProcessData);
    if (elements.btnExportExcel) elements.btnExportExcel.addEventListener('click', () => exportData('xlsx'));
    if (elements.btnExportCsv) elements.btnExportCsv.addEventListener('click', () => exportData('csv'));
    if (elements.btnCopyTable) elements.btnCopyTable.addEventListener('click', copyTableToClipboard);
    if (elements.btnPrintTable) elements.btnPrintTable.addEventListener('click', () => window.print());
    if (elements.btnLoadDemo) elements.btnLoadDemo.addEventListener('click', loadDemoData);
    if (elements.btnResetAll) elements.btnResetAll.addEventListener('click', resetAll);
    // Sound Toggle
    if (elements.btnSoundToggle) {
      elements.btnSoundToggle.addEventListener('click', () => {
        soundEnabled = !soundEnabled;
        const iconOn = elements.btnSoundToggle.querySelector('.sound-on-icon');
        const iconOff = elements.btnSoundToggle.querySelector('.sound-off-icon');
        if (iconOn && iconOff) {
          iconOn.style.display = soundEnabled ? 'block' : 'none';
          iconOff.style.display = soundEnabled ? 'none' : 'block';
        }
        elements.btnSoundToggle.title = soundEnabled ? 'Sonido de notificación (Activado)' : 'Sonido de notificación (Silenciado)';
        showToast(soundEnabled ? '🔊 Sonido activado' : '🔇 Sonido silenciado', 'info');
        if (soundEnabled) playSuccessSound('step');
      });
    }

    // Modals
    if (elements.btnHelp) elements.btnHelp.addEventListener('click', () => openModal(elements.modalHelp));
    if (elements.btnCloseModal) elements.btnCloseModal.addEventListener('click', () => closeModal(elements.modalHelp));
    if (elements.btnShortcuts) elements.btnShortcuts.addEventListener('click', () => openModal(elements.modalShortcuts));
    if (elements.btnCloseShortcuts) elements.btnCloseShortcuts.addEventListener('click', () => closeModal(elements.modalShortcuts));
    if (elements.btnClosePreview) elements.btnClosePreview.addEventListener('click', () => closeModal(elements.modalPreview));
    if (elements.btnCloseDossier) elements.btnCloseDossier.addEventListener('click', () => closeModal(elements.modalDossier));

    // Global Empresa Selector Events
    if (elements.globalEmpresaSelect) {
      elements.globalEmpresaSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val === 'custom') {
          if (elements.globalEmpresaCustom) {
            elements.globalEmpresaCustom.style.display = 'inline-block';
            elements.globalEmpresaCustom.focus();
          }
        } else {
          if (elements.globalEmpresaCustom) elements.globalEmpresaCustom.style.display = 'none';
          syncEmpresaSelectors(val);
          const selText = e.target.options[e.target.selectedIndex]?.text || val;
          showToast(`🏢 Empresa activa: ${selText}`, 'info');
        }
      });
    }
    if (elements.globalEmpresaCustom) {
      elements.globalEmpresaCustom.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        if (val) {
          syncEmpresaSelectors(val);
        }
      });
    }

    // Modal Empresa Selectors Sync Back
    [elements.sqlParamEmpresa, elements.sqlParam2Empresa, elements.sqlParam3Empresa, elements.sqlParam4Empresa].forEach(sel => {
      if (sel) {
        sel.addEventListener('change', (e) => {
          syncEmpresaSelectors(e.target.value);
        });
      }
    });

    // Modal Sincronización Completa SQL (Sync All) Events
    if (elements.btnLoadAllSql) {
      elements.btnLoadAllSql.addEventListener('click', () => {
        openModal(elements.modalSqlSyncAll);
        populateSyncAllModalWithActiveSettings();
      });
    }
    if (elements.btnCloseSqlSyncAll) {
      elements.btnCloseSqlSyncAll.addEventListener('click', () => closeModal(elements.modalSqlSyncAll));
    }
    if (elements.btnCancelSqlSyncAll) {
      elements.btnCancelSqlSyncAll.addEventListener('click', () => closeModal(elements.modalSqlSyncAll));
    }

    // Checkbox toggles in Sync All Modal
    [elements.syncAllInclude1, elements.syncAllInclude2, elements.syncAllInclude3, elements.syncAllInclude4, elements.syncAllInclude5].forEach(chk => {
      if (chk) chk.addEventListener('change', updateSyncAllSummaryCount);
    });

    // Master Empresa change in Sync All Modal
    if (elements.syncAllMasterEmpresa) {
      elements.syncAllMasterEmpresa.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val === 'custom') {
          if (elements.syncAllMasterEmpresaCustom) {
            elements.syncAllMasterEmpresaCustom.style.display = 'inline-block';
            elements.syncAllMasterEmpresaCustom.focus();
          }
        } else {
          if (elements.syncAllMasterEmpresaCustom) elements.syncAllMasterEmpresaCustom.style.display = 'none';
          syncEmpresaSelectors(val);
        }
      });
    }
    if (elements.syncAllMasterEmpresaCustom) {
      elements.syncAllMasterEmpresaCustom.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        if (val) syncEmpresaSelectors(val);
      });
    }

    // Master Mes / Año change in Sync All Modal
    if (elements.syncAllMasterMes) {
      elements.syncAllMasterMes.addEventListener('change', () => {
        const m = parseInt(elements.syncAllMasterMes.value, 10);
        const y = parseInt((elements.syncAllMasterAnio && elements.syncAllMasterAnio.value) || '2026', 10);
        if (elements.syncAllP1Mes) elements.syncAllP1Mes.value = String(m);
        if (elements.syncAllP2Mes) elements.syncAllP2Mes.value = String(m);
        calculateAndSetSyncAllDates(m, y);
      });
    }
    if (elements.syncAllMasterAnio) {
      elements.syncAllMasterAnio.addEventListener('input', () => {
        const m = parseInt((elements.syncAllMasterMes && elements.syncAllMasterMes.value) || '8', 10);
        const y = parseInt(elements.syncAllMasterAnio.value, 10);
        if (elements.syncAllP1Anio) elements.syncAllP1Anio.value = String(y);
        if (elements.syncAllP2Anio) elements.syncAllP2Anio.value = String(y);
        calculateAndSetSyncAllDates(m, y);
      });
    }

    // Quick Action: Auto Fechas
    if (elements.btnSyncAllCalcDates) {
      elements.btnSyncAllCalcDates.addEventListener('click', () => {
        const m = parseInt((elements.syncAllMasterMes && elements.syncAllMasterMes.value) || '8', 10);
        const y = parseInt((elements.syncAllMasterAnio && elements.syncAllMasterAnio.value) || '2026', 10);
        calculateAndSetSyncAllDates(m, y);
        showToast('📅 Fechas de corte y marcaciones actualizadas.', 'info');
      });
    }

    // Quick Action: Aplicar a todo
    if (elements.btnSyncAllApplyMaster) {
      elements.btnSyncAllApplyMaster.addEventListener('click', () => {
        const empVal = (elements.syncAllMasterEmpresa && elements.syncAllMasterEmpresa.value === 'custom')
          ? (elements.syncAllMasterEmpresaCustom && elements.syncAllMasterEmpresaCustom.value.trim()) || '14'
          : (elements.syncAllMasterEmpresa && elements.syncAllMasterEmpresa.value) || '14';
        const m = parseInt((elements.syncAllMasterMes && elements.syncAllMasterMes.value) || '8', 10);
        const y = parseInt((elements.syncAllMasterAnio && elements.syncAllMasterAnio.value) || '2026', 10);
        syncEmpresaSelectors(empVal);
        if (elements.syncAllP1Mes) elements.syncAllP1Mes.value = String(m);
        if (elements.syncAllP1Anio) elements.syncAllP1Anio.value = String(y);
        if (elements.syncAllP2Mes) elements.syncAllP2Mes.value = String(m);
        if (elements.syncAllP2Anio) elements.syncAllP2Anio.value = String(y);
        calculateAndSetSyncAllDates(m, y);
        showToast(`✅ Parámetros propagados a las 5 consultas (Empresa ${empVal}, Periodo ${m}/${y}).`, 'success');
      });
    }

    // Submit Sync All Form
    if (elements.formSqlSyncAll) {
      elements.formSqlSyncAll.addEventListener('submit', (e) => {
        e.preventDefault();
        const do1 = elements.syncAllInclude1 && elements.syncAllInclude1.checked;
        const do2 = elements.syncAllInclude2 && elements.syncAllInclude2.checked;
        const do3 = elements.syncAllInclude3 && elements.syncAllInclude3.checked;
        const do4 = elements.syncAllInclude4 && elements.syncAllInclude4.checked;
        const do5 = elements.syncAllInclude5 && elements.syncAllInclude5.checked;

        if (!do1 && !do2 && !do3 && !do4 && !do5) {
          showToast('⚠️ Debes seleccionar al menos una fuente para sincronizar.', 'warning');
          return;
        }

        const now = new Date();
        const defMes = String(now.getMonth() + 1);
        const defAnio = String(now.getFullYear());
        const range3d = getDefault3DaysRange();

        const p1 = {
          idEmpresa: (elements.syncAllP1Empresa && elements.syncAllP1Empresa.value.trim()) || '14',
          activo: (elements.syncAllP1Activo && elements.syncAllP1Activo.value) || '1',
          mes: (elements.syncAllP1Mes && elements.syncAllP1Mes.value) || defMes,
          anio: (elements.syncAllP1Anio && elements.syncAllP1Anio.value) || defAnio,
          fechaini: (elements.syncAllP1Fechaini && elements.syncAllP1Fechaini.value.trim()) || ''
        };

        const p2 = {
          idEmpresa: (elements.syncAllP2Empresa && elements.syncAllP2Empresa.value.trim()) || '14',
          mes: (elements.syncAllP2Mes && elements.syncAllP2Mes.value) || defMes,
          anio: (elements.syncAllP2Anio && elements.syncAllP2Anio.value) || defAnio
        };

        const p3 = {
          idEmpresa: (elements.syncAllP3Empresa && elements.syncAllP3Empresa.value.trim()) || '14',
          fechaDesde: (elements.syncAllP3Desde && elements.syncAllP3Desde.value.trim()) || range3d.desde,
          fechaHasta: (elements.syncAllP3Hasta && elements.syncAllP3Hasta.value.trim()) || range3d.hasta,
          sw_contrato: (elements.syncAllP3Sw && elements.syncAllP3Sw.value) || '0'
        };

        const p4 = {
          codPais: (elements.syncAllP4Codpais && elements.syncAllP4Codpais.value.trim()) || 'PE',
          idEmpresa: (elements.syncAllP4Empresa && elements.syncAllP4Empresa.value.trim()) || '0',
          desde: (elements.syncAllP4Desde && elements.syncAllP4Desde.value.trim()) || range3d.desde,
          hasta: (elements.syncAllP4Hasta && elements.syncAllP4Hasta.value.trim()) || range3d.hasta
        };

        const p5 = {
          idEmpresa: (elements.syncAllP5Empresa && elements.syncAllP5Empresa.value.trim()) || '14'
        };

        closeModal(elements.modalSqlSyncAll);
        executeCustomParallelSync({ do1, do2, do3, do4, do5, p1, p2, p3, p4, p5 });
      });
    }

    // Card 1 SQL Events
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
        const now = new Date();
        const customParams = {
          idEmpresa: elements.sqlParamEmpresa ? elements.sqlParamEmpresa.value : getSelectedEmpresaId(),
          activo: elements.sqlParamActivo ? elements.sqlParamActivo.value : '1',
          mes: elements.sqlParamMes ? elements.sqlParamMes.value : String(now.getMonth() + 1),
          anio: elements.sqlParamAnio ? elements.sqlParamAnio.value : String(now.getFullYear()),
          fechaini: elements.sqlParamFechaini ? elements.sqlParamFechaini.value.trim() : ''
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
          idEmpresa: elements.sqlParam2Empresa ? elements.sqlParam2Empresa.value : getSelectedEmpresaId(),
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
    if (elements.btnCalc3Days) {
      elements.btnCalc3Days.addEventListener('click', () => {
        const range = getDefault3DaysRange();
        if (elements.sqlParam3Desde) elements.sqlParam3Desde.value = range.desde;
        if (elements.sqlParam3Hasta) elements.sqlParam3Hasta.value = range.hasta;
        showToast(`Fechas ajustadas: ${range.desde} al ${range.hasta} (3 días)`, 'info');
      });
    }
    if (elements.formSqlParams3) {
      elements.formSqlParams3.addEventListener('submit', (e) => {
        e.preventDefault();
        const customParams = {
          fechaDesde: elements.sqlParam3Desde ? elements.sqlParam3Desde.value : '18/08/2026',
          fechaHasta: elements.sqlParam3Hasta ? elements.sqlParam3Hasta.value : '20/08/2026',
          idEmpresa: elements.sqlParam3Empresa ? elements.sqlParam3Empresa.value : getSelectedEmpresaId(),
          sw_contrato: elements.sqlParam3Sw ? elements.sqlParam3Sw.value : '0'
        };
        loadMarcacionesFromSqlServer(customParams);
      });
    }

    // Card 4 SQL Events (Buses & Rutas - SPC_REGISTRO_RUTA)
    if (elements.btnLoadSql4) {
      elements.btnLoadSql4.addEventListener('click', () => loadBusesFromSqlServer());
    }
    if (elements.btnOpenSqlParams4) {
      elements.btnOpenSqlParams4.addEventListener('click', () => openModal(elements.modalSqlParams4));
    }
    if (elements.btnCloseSqlParams4) {
      elements.btnCloseSqlParams4.addEventListener('click', () => closeModal(elements.modalSqlParams4));
    }
    if (elements.btnCancelSqlParams4) {
      elements.btnCancelSqlParams4.addEventListener('click', () => closeModal(elements.modalSqlParams4));
    }
    if (elements.formSqlParams4) {
      elements.formSqlParams4.addEventListener('submit', (e) => {
        e.preventDefault();
        const customParams = {
          codPais: elements.sqlParam4Codpais ? elements.sqlParam4Codpais.value.trim() : 'PE',
          desde: elements.sqlParam4Desde ? elements.sqlParam4Desde.value.trim() : '16-08-2026',
          hasta: elements.sqlParam4Hasta ? elements.sqlParam4Hasta.value.trim() : '31-08-2026',
          idEmpresa: elements.sqlParam4Empresa ? elements.sqlParam4Empresa.value : getSelectedEmpresaId()
        };
        loadBusesFromSqlServer(customParams);
      });
    }

    // Card 5 SQL Events (Cuadrillas)
    if (elements.btnLoadSql5) {
      elements.btnLoadSql5.addEventListener('click', () => loadCuadrillasFromSqlServer());
    }

    // Direct Database Connection Configuration Modal Events
    if (elements.btnDbConfig) {
      elements.btnDbConfig.addEventListener('click', () => {
        openModal(elements.modalSqlDbConfig);
        loadSqlDatabaseConfig();
      });
    }
    if (elements.dbStatusBadge) {
      elements.dbStatusBadge.addEventListener('click', () => {
        openModal(elements.modalSqlDbConfig);
        loadSqlDatabaseConfig();
      });
    }
    if (elements.btnCloseSqlDbConfig) {
      elements.btnCloseSqlDbConfig.addEventListener('click', () => closeModal(elements.modalSqlDbConfig));
    }
    if (elements.btnCancelSqlDbConfig) {
      elements.btnCancelSqlDbConfig.addEventListener('click', () => closeModal(elements.modalSqlDbConfig));
    }
    if (elements.btnTestDbConfig) {
      elements.btnTestDbConfig.addEventListener('click', () => testSqlDatabaseConnection());
    }
    if (elements.btnResetDbConfig) {
      elements.btnResetDbConfig.addEventListener('click', resetSqlDatabaseConfig);
    }
    if (elements.btnToggleDbPwd && elements.dbConfigPwd) {
      elements.btnToggleDbPwd.addEventListener('click', () => {
        const isPassword = elements.dbConfigPwd.type === 'password';
        elements.dbConfigPwd.type = isPassword ? 'text' : 'password';
        elements.btnToggleDbPwd.innerHTML = isPassword
          ? '<svg class="eye-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>'
          : '<svg class="eye-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
      });
    }
    if (elements.formSqlDbConfig) {
      elements.formSqlDbConfig.addEventListener('submit', (e) => {
        e.preventDefault();
        saveSqlDatabaseConfig();
      });
    }

    [elements.modalHelp, elements.modalShortcuts, elements.modalPreview, elements.modalDossier, elements.modalSqlParams, elements.modalSqlParams2, elements.modalSqlParams3, elements.modalSqlParams4, elements.modalSqlSyncAll, elements.modalSqlDbConfig].forEach(modal => {
      if (!modal) return;
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal(modal);
      });
    });

    // Search & Filter
    if (elements.tableSearch) {
      elements.tableSearch.addEventListener('input', (e) => {
        state.searchTerm = e.target.value.toLowerCase().trim();
        if (elements.btnClearSearch) {
          elements.btnClearSearch.classList.toggle('visible', state.searchTerm.length > 0);
        }
        state.currentPage = 1;
        applyFilters();
      });
    }

    if (elements.btnClearSearch) {
      elements.btnClearSearch.addEventListener('click', () => {
        if (elements.tableSearch) elements.tableSearch.value = '';
        state.searchTerm = '';
        elements.btnClearSearch.classList.remove('visible');
        state.currentPage = 1;
        applyFilters();
      });
    }

    // Filter Chips
    if (elements.filterChips) {
      elements.filterChips.forEach(chip => {
        chip.addEventListener('click', () => {
          elements.filterChips.forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          state.activeFilter = chip.dataset.filter;
          state.currentPage = 1;
          applyFilters();
        });
      });
    }

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
    if (elements.selectPageSize) {
      elements.selectPageSize.addEventListener('change', (e) => {
        state.pageSize = parseInt(e.target.value, 10);
        state.currentPage = 1;
        renderTable();
      });
    }

    // Pagination Buttons
    if (elements.btnFirstPage) {
      elements.btnFirstPage.addEventListener('click', () => {
        state.currentPage = 1;
        renderTable();
      });
    }
    if (elements.btnPrevPage) {
      elements.btnPrevPage.addEventListener('click', () => {
        if (state.currentPage > 1) {
          state.currentPage--;
          renderTable();
        }
      });
    }
    if (elements.btnNextPage) {
      elements.btnNextPage.addEventListener('click', () => {
        const maxPage = Math.ceil(state.filteredData.length / state.pageSize) || 1;
        if (state.currentPage < maxPage) {
          state.currentPage++;
          renderTable();
        }
      });
    }
    if (elements.btnLastPage) {
      elements.btnLastPage.addEventListener('click', () => {
        const maxPage = Math.ceil(state.filteredData.length / state.pageSize) || 1;
        state.currentPage = maxPage;
        renderTable();
      });
    }

    // Export & Action Buttons
    if (elements.btnExportExcelHeader) {
      elements.btnExportExcelHeader.addEventListener('click', () => {
        if (!state.consolidatedData || state.consolidatedData.length === 0) {
          if (state.file1.data && state.file1.data.length > 0) {
            handleProcessData();
            setTimeout(() => exportData('xlsx'), 400);
          } else {
            showToast('Primero haz clic en ⚡ Sincronizar Todo (SQL) o carga los datos.', 'info');
          }
        } else {
          exportData('xlsx');
        }
      });
    }

    if (elements.btnExportExcel) {
      elements.btnExportExcel.addEventListener('click', () => {
        if (!state.consolidatedData || state.consolidatedData.length === 0) {
          if (state.file1.data && state.file1.data.length > 0) {
            handleProcessData();
            setTimeout(() => exportData('xlsx'), 400);
          } else {
            showToast('Primero haz clic en ⚡ Sincronizar Todo (SQL) o carga los datos.', 'info');
          }
        } else {
          exportData('xlsx');
        }
      });
    }

    if (elements.btnExportCsv) {
      elements.btnExportCsv.addEventListener('click', () => {
        exportData('csv');
      });
    }

    if (elements.btnPrint) {
      elements.btnPrint.addEventListener('click', () => {
        window.print();
      });
    }

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
    if (!modal) return;
    modal.classList.add('active');
    modal.style.setProperty('display', 'flex', 'important');
    modal.style.setProperty('opacity', '1', 'important');
    modal.style.setProperty('visibility', 'visible', 'important');
    modal.style.setProperty('pointer-events', 'auto', 'important');
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('active');
    modal.style.setProperty('display', 'none', 'important');
    modal.style.setProperty('opacity', '0', 'important');
    modal.style.setProperty('visibility', 'hidden', 'important');
    modal.style.setProperty('pointer-events', 'none', 'important');
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
    if (!zone || !input) return;
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
    playSuccessSound('step');
    showToast(`Archivo ${fileIndex} cargado (${sheetName}): ${rawJson.length.toLocaleString()} filas`, 'success');
  }

  // Auto-detect columns
  function autoDetectColumns(fileIndex) {
    const fileKey = `file${fileIndex}`;
    const headers = state[fileKey].headers;

    let detectedKey = '';
    // Prioridad 1: RutTrabajador / RUT/DNI / RUT / DNI exacto
    for (const h of headers) {
      const cleanH = cleanHeader(h);
      if (cleanH === 'ruttrabajador' || cleanH === 'rutdni' || cleanH === 'rut' || cleanH === 'dni' || cleanH === 'numdoc' || cleanH === 'docidentidad' || cleanH === 'documento') {
        detectedKey = h;
        break;
      }
    }
    // Prioridad 2: Que contenga 'rut' o 'dni'
    if (!detectedKey) {
      for (const h of headers) {
        const cleanH = cleanHeader(h);
        if (cleanH.includes('rut') || cleanH.includes('dni')) {
          detectedKey = h;
          break;
        }
      }
    }
    // Prioridad 3: Código de trabajador / ID
    if (!detectedKey) {
      for (const h of headers) {
        const cleanH = cleanHeader(h);
        if (ID_KEYWORDS.some(keyword => cleanH === keyword || cleanH.includes(keyword))) {
          detectedKey = h;
          break;
        }
      }
    }
    state[fileKey].keyCol = detectedKey || headers[0];

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
    if (card) card.classList.add('loaded');
    if (infoBox) {
      infoBox.classList.add('active');
      const nameEl = infoBox.querySelector('.file-name');
      const metaEl = infoBox.querySelector('.file-meta');
      const removeBtn = infoBox.querySelector('.btn-remove-file');
      if (nameEl && file) nameEl.textContent = file.name;
      if (metaEl) metaEl.textContent = `${formatBytes(file ? file.size : 0)} • ${(rowCount || 0).toLocaleString()} filas`;
      if (removeBtn) {
        removeBtn.onclick = (e) => {
          e.stopPropagation();
          resetSingleFile(fileIndex);
        };
      }
    }

    populateSelects(fileIndex);
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
      if (elements.keySelect1) {
        populateSelect(elements.keySelect1, headers, state.file1.keyCol);
        elements.keySelect1.onchange = (e) => { state.file1.keyCol = e.target.value; };
      }
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
      if (elements.keySelect2) {
        populateSelect(elements.keySelect2, headers, state.file2.keyCol);
        elements.keySelect2.onchange = (e) => { state.file2.keyCol = e.target.value; };
      }
      if (elements.actSelect2) {
        populateSelect(elements.actSelect2, headers, state.file2.actCol);
        elements.actSelect2.onchange = (e) => { state.file2.actCol = e.target.value; };
      }
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
    } else if (fileIndex === 3) {
      if (elements.keySelect3) {
        populateSelect(elements.keySelect3, headers, state.file3.keyCol);
        elements.keySelect3.onchange = (e) => { state.file3.keyCol = e.target.value; };
      }
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
        populateSelect(elements.codBusSelect4, headers, state.file4.codBusCol, '(Auto-detectar)');
        elements.codBusSelect4.onchange = (e) => { state.file4.codBusCol = e.target.value; };
      }
      if (elements.rutaSelect4) {
        populateSelect(elements.rutaSelect4, headers, state.file4.rutaCol, '(Opcional)');
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

    if (card) card.classList.remove('loaded');
    if (infoBox) infoBox.classList.remove('active');
    if (input) input.value = '';

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
    if (elements.resultsSection) elements.resultsSection.classList.remove('active');
    if (elements.step1) {
      elements.step1.classList.add('active');
      elements.step1.classList.remove('completed');
    }
    if (elements.step2) elements.step2.classList.remove('active', 'completed');
    if (elements.step3) elements.step3.classList.remove('active', 'completed');
    showToast('Todos los datos han sido restablecidos', 'info');
  }

  // Check processing readiness
  function checkProcessingReadiness() {
    const ready = state.file1.data && state.file2.data && state.file3.data;
    if (elements.btnProcess) elements.btnProcess.disabled = !ready;
    if (elements.step1) {
      if (ready) {
        elements.step1.classList.add('completed');
      } else {
        elements.step1.classList.add('active');
        elements.step1.classList.remove('completed');
      }
    }
    if (elements.step2) {
      if (ready) {
        elements.step2.classList.add('active');
      } else {
        elements.step2.classList.remove('active');
      }
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
    if (!state.file1.data || state.file1.data.length === 0) {
      showToast('Por favor sincronice con "⚡ Sincronizar SQL" o cargue datos demo primero', 'info');
      return;
    }
    // Si file2 o file3 aún no tienen datos, inicializar estructuras seguras para permitir consolidación
    if (!state.file2.data) {
      state.file2 = { data: [], headers: [], keyCol: 'RutTrabajador', sheetNames: ['SQL_Result'], selectedSheet: 'SQL_Result' };
    }
    if (!state.file3.data) {
      state.file3 = { data: [], headers: [], keyCol: 'RutTrabajador', sheetNames: ['SQL_Result'], selectedSheet: 'SQL_Result' };
    }

    const keyCol1 = (elements.keySelect1 && elements.keySelect1.value) || state.file1.keyCol || 'RutTrabajador';
    const keyCol2 = (elements.keySelect2 && elements.keySelect2.value) || (state.file2 && state.file2.keyCol) || 'RUT/DNI';
    const actCol2 = (elements.actSelect2 && elements.actSelect2.value) || (state.file2 && state.file2.actCol) || 'ACTIVIDAD';
    const laborCol2 = (elements.laborSelect2 && elements.laborSelect2.value) || (state.file2 && state.file2.laborCol) || 'LABOR';
    const turnoCol2 = (elements.turnoSelect2 && elements.turnoSelect2.value) || (state.file2 && state.file2.turnoCol) || 'HoraInicio';
    const keyCol3 = (elements.keySelect3 && elements.keySelect3.value) || (state.file3 && state.file3.keyCol) || 'RutTrabajador';

    if (!keyCol1) {
      showToast('Por favor selecciona la columna clave de trabajadores', 'error');
      return;
    }

    // Step 1: Index File 3 (Marcaciones & Placas de Bus) - Optimizado O(1)
    const markingsIndex = new Map();
    const markingsBusPlacasIndex = new Map();

    const f3Sample = (state.file3 && state.file3.data && state.file3.data[0]) || {};
    const f3Headers = Object.keys(f3Sample);

    let nomEstCol3 = (elements.nomEstSelect3 && elements.nomEstSelect3.value) || state.file3.nomEstCol;
    let tipoEstCol3 = (elements.tipoEstSelect3 && elements.tipoEstSelect3.value) || state.file3.tipoEstCol;

    if (!nomEstCol3 || f3Sample[nomEstCol3] === undefined) {
      nomEstCol3 = f3Headers.find(h => {
        const c = cleanHeader(h);
        return c.includes('nombreestacion') || c === 'estacion' || c.includes('nomest') || c.includes('placa');
      }) || 'NOMBRE_ESTACION';
    }
    if (!tipoEstCol3 || f3Sample[tipoEstCol3] === undefined) {
      tipoEstCol3 = f3Headers.find(h => {
        const c = cleanHeader(h);
        return c.includes('tipoestacion') || c === 'tipo' || c.includes('tipoest');
      }) || 'TIPO_ESTACION';
    }

    state.file3.data.forEach(row => {
      const rawKey = row[keyCol3];
      if (!rawKey) return;
      const key = cleanHeader(rawKey);
      if (!key) return;

      markingsIndex.set(key, (markingsIndex.get(key) || 0) + 1);

      const tipoEstVal = String(row[tipoEstCol3] || '').trim().toUpperCase();
      if (tipoEstVal.includes('BUS')) {
        const cleanPlaca = String(row[nomEstCol3] || '').trim();
        if (cleanPlaca) {
          const existingPlacas = markingsBusPlacasIndex.get(key) || [];
          if (!existingPlacas.includes(cleanPlaca)) {
            existingPlacas.push(cleanPlaca);
            markingsBusPlacasIndex.set(key, existingPlacas);
          }
        }
      }
    });

    // Step 2: Index File 4 (Catálogo de Buses y Rutas - Indexación Multiclave) - Optimizado O(1)
    const busesCatalogMap = new Map();
    if (state.file4.data && state.file4.data.length > 0) {
      const f4Sample = state.file4.data[0] || {};
      const f4Headers = Object.keys(f4Sample);
      let patenteCol4 = (elements.patenteSelect4 && elements.patenteSelect4.value) || state.file4.patenteCol ||
        f4Headers.find(h => cleanHeader(h).includes('patente') || cleanHeader(h).includes('placa')) || 'Patente';
      let codBusCol4 = (elements.codBusSelect4 && elements.codBusSelect4.value) || state.file4.codBusCol ||
        f4Headers.find(h => cleanHeader(h).includes('codigocampo') || cleanHeader(h).includes('codbus')) || 'Codigo Campo';
      let rutaCol4 = (elements.rutaSelect4 && elements.rutaSelect4.value) || state.file4.rutaCol ||
        f4Headers.find(h => cleanHeader(h).includes('descripcionruta') || cleanHeader(h).includes('ruta')) || 'Descripcion Ruta';

      state.file4.data.forEach(busRow => {
        const patenteVal = formatCellValue(busRow[patenteCol4]);
        const codBusVal = formatCellValue(busRow[codBusCol4]);
        let rutaVal = formatCellValue(busRow[rutaCol4]);

        if (rutaVal) {
          const rLow = rutaVal.trim().toLowerCase();
          if (rLow === 'true' || rLow === 'false' || rLow === '0' || rLow === '1' || rLow === 'vigente' || rLow === 'no vigente' || rLow.includes('periodo')) {
            rutaVal = '';
          }
        }

        const info = { codBus: codBusVal, ruta: rutaVal, patenteOriginal: patenteVal };
        if (patenteVal) {
          const cleanPlate = cleanHeader(patenteVal);
          if (cleanPlate) busesCatalogMap.set(cleanPlate, info);
        }
        if (codBusVal) {
          const cleanCod = cleanHeader(codBusVal);
          if (cleanCod && !busesCatalogMap.has(cleanCod)) busesCatalogMap.set(cleanCod, info);
        }
        if (busRow['Bus']) {
          const cleanBus = cleanHeader(busRow['Bus']);
          if (cleanBus && !busesCatalogMap.has(cleanBus)) busesCatalogMap.set(cleanBus, info);
        }
      });
    }

    // Step 2.5: Index File 5 (Catálogo de Cuadrillas & Encargados) - Optimizado O(1)
    const cuadrillasCatalogMap = new Map();
    if (state.file5.data && state.file5.data.length > 0) {
      const f5Sample = state.file5.data[0] || {};
      const f5Headers = Object.keys(f5Sample);
      let idCuadCol5 = (elements.idcuadrillaSelect5 && elements.idcuadrillaSelect5.value) || state.file5.idCuadrillaCol ||
        f5Headers.find(h => cleanHeader(h).includes('idcuadrilla')) || 'IDCUADRILLA';
      let descCol5 = (elements.descCuadrillaSelect5 && elements.descCuadrillaSelect5.value) || state.file5.descCol ||
        f5Headers.find(h => cleanHeader(h).includes('descripcion') || cleanHeader(h).includes('encargado')) || 'Descripcion';
      let nomCol5 = (elements.nombreEncargadoSelect5 && elements.nombreEncargadoSelect5.value) || state.file5.nombreEncargadoCol ||
        f5Headers.find(h => cleanHeader(h).includes('nombreencargado')) || 'NombreEncargado';

      state.file5.data.forEach(cRow => {
        const idVal = formatCellValue(cRow[idCuadCol5]);
        const descVal = formatCellValue(cRow[descCol5]);
        const nomVal = formatCellValue(cRow[nomCol5]);

        if (idVal) {
          const cleanId = cleanHeader(idVal);
          if (cleanId) cuadrillasCatalogMap.set(cleanId, descVal || nomVal || idVal);
        }
      });
    }

    // Step 3: Index File 2 (Último día laborado con selección inteligente)
    const lastDayIndex = new Map();
    state.file2.data.forEach(row => {
      const key = cleanHeader(row[keyCol2]);
      if (!key) return;

      const existingRow = lastDayIndex.get(key);
      if (!existingRow) {
        lastDayIndex.set(key, row);
      } else {
        // Si hay múltiples filas para el mismo trabajador, priorizar la fila con labor real sobre 'FALTA' o vacía
        const existingAct = extractRawFromRow(existingRow, ['actividad', 'tipoactividad', 'motivo']) || '';
        const newAct = extractRawFromRow(row, ['actividad', 'tipoactividad', 'motivo']) || '';
        
        const existingIsFalta = !existingAct || isAbsenceActivity(existingAct) || String(existingAct).toUpperCase().includes('FALTA');
        const newIsFalta = !newAct || isAbsenceActivity(newAct) || String(newAct).toUpperCase().includes('FALTA');

        if (existingIsFalta && !newIsFalta) {
          lastDayIndex.set(key, row);
        } else if (!existingIsFalta && !newIsFalta) {
          const existingScore = (existingRow['IdCuadrilla'] ? 1 : 0) + (existingRow['Bus Patente'] ? 1 : 0) + (existingRow['LABOR'] ? 1 : 0);
          const newScore = (row['IdCuadrilla'] ? 1 : 0) + (row['Bus Patente'] ? 1 : 0) + (row['LABOR'] ? 1 : 0);
          if (newScore > existingScore) {
            lastDayIndex.set(key, row);
          }
        }
      }
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

      // Evitar duplicar al trabajador si aparece repetido en la fuente dentro de la misma empresa
      const dedupeKey = workerId + '::' + String(row1['Empresa'] || row1['IdEmpresa'] || row1['IDEMPRESA'] || '');
      if (seenWorkerIds.has(dedupeKey)) {
        return;
      }
      seenWorkerIds.add(dedupeKey);

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

      if (busesCatalogMap.size > 0) {
        const keysToCheck = [];
        if (placaConsolidada) {
          placaConsolidada.split('/').forEach(p => {
            const cp = cleanHeader(p);
            if (cp && !keysToCheck.includes(cp)) keysToCheck.push(cp);
          });
        }
        if (row2) {
          if (row2['Bus Patente']) {
            const cp = cleanHeader(row2['Bus Patente']);
            if (cp && !keysToCheck.includes(cp)) keysToCheck.push(cp);
          }
          if (row2['Codigo Bus']) {
            const cb = cleanHeader(row2['Codigo Bus']);
            if (cb && !keysToCheck.includes(cb)) keysToCheck.push(cb);
          }
        }

        const codigosList = [];
        const rutasList = [];

        keysToCheck.forEach(k => {
          const busInfo = busesCatalogMap.get(k);
          if (busInfo) {
            if (busInfo.codBus && !codigosList.includes(busInfo.codBus)) codigosList.push(busInfo.codBus);
            if (busInfo.ruta && !rutasList.includes(busInfo.ruta)) rutasList.push(busInfo.ruta);
            if (!placaConsolidada && busInfo.patenteOriginal) placaConsolidada = busInfo.patenteOriginal;
          }
        });

        if (codigosList.length > 0) codigoBusConsolidado = codigosList.join(' / ');
        if (rutasList.length > 0) rutaConsolidada = rutasList.join(' / ');
      }

      if (!codigoBusConsolidado) codigoBusConsolidado = extractValueForColumn('CODIGO BUS', row2, row1, keyCol1);
      if (!rutaConsolidada) rutaConsolidada = extractValueForColumn('RUTA', row2, row1, keyCol1);

      if (rutaConsolidada) {
        const rLow = String(rutaConsolidada).trim().toLowerCase();
        if (rLow === 'true' || rLow === 'false' || rLow === '0' || rLow === '1' || rLow === 'vigente' || rLow === 'no vigente' || rLow.includes('periodo') || rLow.includes('vigente/periodo')) {
          rutaConsolidada = '';
        }
      }

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
        const activeEmpId = typeof getSelectedEmpresaId === 'function' ? getSelectedEmpresaId() : '14';
        empresaConsolidada = EMPRESAS_MAP[activeEmpId] || 'SOCIEDAD EXPORTADORA VERFRUT S. A. C.';
      }

      // Zona Labores y SubCentroCosto / Cuartel
      const hasRegularLaborInFile2 = row2 && (actividadVal || laborVal) && !isAbsenceActivity(actividadVal) && !isAbsenceActivity(laborVal);

      let zonaConsolidada = '';
      if (hasRegularLaborInFile2 && row2) {
        // En Archivo 2 buscar ZONA o Zona Labores (sin tomar Labor)
        const rawZ2 = extractFromRow(row2, ['zona', 'zonalabores', 'zonadelabores', 'sede', 'fundo', 'campo', 'ubicacion']) ||
                      extractFromRow(row1, ['zonalabores', 'zonadelabores', 'zona', 'sede', 'fundo', 'campo', 'centrocostopredio']);
        zonaConsolidada = formatZonaValue(rawZ2, empresaConsolidada);
      } else {
        const rawZ1 = extractFromRow(row1, ['zonalabores', 'zonadelabores', 'zona', 'sede', 'fundo', 'campo', 'centrocostopredio']) ||
                      (row2 ? extractFromRow(row2, ['zona', 'zonalabores', 'zonadelabores', 'sede', 'fundo', 'campo', 'ubicacion']) : '');
        zonaConsolidada = formatZonaValue(rawZ1, empresaConsolidada);
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
        } else if (colName === 'Tiene Digitacion (jornal)') {
          consolidatedRow['Tiene Digitacion (jornal)'] = (digText === 'SI' || digText === 'SÍ' || digText === '1') ? 'SÍ' : (digText === 'NO' || digText === 'N' ? 'NO' : (digText || 'NO'));
        } else if (colName === 'RutTrabajador') {
          consolidatedRow['RutTrabajador'] = formatCellValue(row1[keyCol1] || workerId);
        } else if (colName === 'CodigoTrabajador') {
          consolidatedRow['CodigoTrabajador'] = formatCellValue(row1['CodigoTrabajador'] || row1['CodTrabajador'] || row1['Codigo'] || extractValueForColumn(colName, row2, row1, keyCol1));
        } else if (colName === 'FechaNacimiento') {
          consolidatedRow['FechaNacimiento'] = formatCellValue(row1['Fec.Nacimiento'] || row1['FechaNacimiento'] || row1['FecNacimiento'] || extractValueForColumn(colName, row2, row1, keyCol1));
        } else if (colName === 'Sexo') {
          consolidatedRow['Sexo'] = formatCellValue(row1['Sexo'] || row1['SEXO'] || extractValueForColumn(colName, row2, row1, keyCol1));
        } else if (colName === 'Edad') {
          consolidatedRow['Edad'] = formatCellValue(row1['Edad'] || row1['EDAD'] || extractValueForColumn(colName, row2, row1, keyCol1));
        } else if (colName === 'FechaInicioPeriodo') {
          consolidatedRow['FechaInicioPeriodo'] = formatCellValue(row1['Fec.Ingreso'] || row1['FechaInicioPeriodo'] || row1['FecIngreso'] || extractValueForColumn(colName, row2, row1, keyCol1));
        } else if (colName === 'FechaInicioContrato') {
          consolidatedRow['FechaInicioContrato'] = formatCellValue(row1['Fec.InicioContrato'] || row1['FechaInicioContrato'] || extractValueForColumn(colName, row2, row1, keyCol1));
        } else if (colName === 'FechaTerminoContrato') {
          consolidatedRow['FechaTerminoContrato'] = formatCellValue(row1['Fec.TerminoContrato'] || row1['FechaTerminoContrato'] || extractValueForColumn(colName, row2, row1, keyCol1));
        } else if (colName === 'Oficio') {
          consolidatedRow['Oficio'] = formatCellValue(row1['Oficio'] || row1['Cargo'] || (row2 && row2['Oficio']) || extractValueForColumn(colName, row2, row1, keyCol1));
        } else if (colName === 'Regimen') {
          consolidatedRow['Regimen'] = formatCellValue(row1['Tipo Regimen'] || row1['Regimen'] || row1['REGIMEN'] || extractValueForColumn(colName, row2, row1, keyCol1));
        } else if (colName === 'HASTA') {
          let hastaVal = '';
          if (row2) {
            // Extraer estrictamente el campo "ULTIMO DIA" de la consulta Último Día Laborado
            for (const k of Object.keys(row2)) {
              const ck = cleanHeader(k);
              if (ck === 'ultimodia' || ck === 'fechaultimodia' || ck === 'fecultdia' || ck === 'ultimodialaborado') {
                hastaVal = row2[k];
                break;
              }
            }
            if (!hastaVal) {
              hastaVal = row2['ULTIMO DIA'] || row2['ÚLTIMO DIA'] || row2['ÚLTIMO DÍA'] || row2['ULTIMO DÍA'] || row2['ULTIMO_DIA'] || row2['Ultimo Dia'] || row2['ultimo dia'] || row2['ULTIMODIA'] || row2['UltimoDia'] || '';
            }
          }
          let formattedHasta = formatCellValue(hastaVal);
          if (formattedHasta) {
            formattedHasta = formattedHasta.replace(/[\sT]00:00:00.*/, '');
          }
          consolidatedRow['HASTA'] = formattedHasta;
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
    if (elements.step2) elements.step2.classList.add('completed');
    if (elements.step3) elements.step3.classList.add('active');

    // Render Metrics, Distribution & Table
    updateMetricsAndDistributionUI();
    renderTableHeader();
    sortData();
    renderTable();

    if (elements.resultsSection) {
      elements.resultsSection.classList.add('active');
    }
    if (typeof window.switchViewMode === 'function') {
      window.switchViewMode('results');
    } else if (elements.resultsSection) {
      elements.resultsSection.scrollIntoView({ behavior: 'smooth' });
    }

    populateFilterDropdowns();
    updateDesktopUIStatus();
    playSuccessSound('chime');
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
    let result = state.consolidatedData || [];

    if (state.activeFilter === 'ACTIVE') {
      result = result.filter(r => r['ESTADO'] === 'ACTIVO');
    } else if (state.activeFilter === 'ABSENT') {
      result = result.filter(r => r['ESTADO'] === 'AUSENTE');
    } else if (state.activeFilter === 'LEAVE') {
      result = result.filter(r => r['ESTADO'] !== 'ACTIVO' && r['ESTADO'] !== 'AUSENTE');
    }

    if (state.filterEmpresa) {
      result = result.filter(r => r['Empresa'] === state.filterEmpresa);
    }

    if (state.filterCuartel) {
      result = result.filter(r => (r['Zona Labores'] === state.filterCuartel) || (r['SubCentroCosto / Cuartel'] === state.filterCuartel));
    }

    if (state.filterRuta) {
      result = result.filter(r => r['RUTA'] === state.filterRuta);
    }

    if (state.filterSinTransporte) {
      result = result.filter(r => {
        const p = String(r['PLACA'] || '').trim();
        const b = String(r['CODIGO BUS'] || '').trim();
        return !p || p === '-' || !b || b === '-';
      });
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
    updateDesktopUIStatus();
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

  const COLUMN_DISPLAY_NAMES = {
    'ESTADO': 'TIPO DE REPORTE',
    'HASTA': 'FECHA & HORA',
    'CodigoTrabajador': 'COD.TRABAJA',
    'Apellidos y Nombres': 'APELLIDOS Y NOMBRES',
    'RutTrabajador': 'DNI',
    'PLACA': 'PLACA / BUS',
    'RUTA': 'RUTA ASIGNADA',
    'Zona Labores': 'ZONA',
    'SubCentroCosto / Cuartel': 'CUARTEL',
    'Tiene Digitacion (jornal)': 'DIGITACIÓN'
  };

  // Render Table Header with sorting & visibility
  function renderTableHeader() {
    const visibleCols = TARGET_COLUMNS.filter(c => state.visibleColumns.has(c));

    elements.tableHead.innerHTML = `
      <tr>
        <th style="width: 44px; text-align: center;"><input type="checkbox" id="chk-select-all" title="Seleccionar todos" style="cursor: pointer;"></th>
        ${visibleCols.map(col => {
          const isSorted = state.sortColumn === col;
          const sortIcon = isSorted ? (state.sortDirection === 'asc' ? '▲' : '▼') : '▲▼';
          const sortClass = isSorted ? (state.sortDirection === 'asc' ? 'asc' : 'desc') : '';
          const dispName = COLUMN_DISPLAY_NAMES[col] || col;

          return `
            <th data-column="${escapeHtml(col)}" title="Ordenar por ${escapeHtml(dispName)}">
              <div class="th-content">
                <span>${escapeHtml(dispName)}</span>
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
      html += `<td style="text-align: center; width: 44px;"><input type="checkbox" class="row-checkbox" style="cursor: pointer;"></td>`;
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

  // Export Data con Estilos Profesionales en Excel (.xlsx)
  async function exportData(format) {
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

    if (format === 'xlsx' && typeof ExcelJS !== 'undefined') {
      try {
        showToast('Generando archivo Excel con diseño y estilos profesionales...', 'info');
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Sistema de Consolidación RRHH';
        workbook.lastModifiedBy = 'Consolidador Verfrut';
        workbook.created = new Date();
        workbook.modified = new Date();

        const worksheet = workbook.addWorksheet('Consolidado Personal', {
          views: [{ showGridLines: true }]
        });

        // 1. Fila de Título Principal
        const titleRow = worksheet.addRow(['CONSOLIDADO GENERAL DE PERSONAL Y ASISTENCIA']);
        worksheet.mergeCells(1, 1, 1, TARGET_COLUMNS.length);
        titleRow.height = 34;
        titleRow.getCell(1).font = { name: 'Segoe UI', size: 15, bold: true, color: { argb: 'FFFFFFFF' } };
        titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }; // Slate 900
        titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

        // 2. Fila de Subtítulo / Métricas
        const total = state.metrics.total || formattedExportData.length;
        const active = state.metrics.active || 0;
        const absent = state.metrics.absent || 0;
        const leave = state.metrics.leave || 0;
        const nowStr = new Date().toLocaleString('es-PE');
        const subtitleText = `Reporte generado el: ${nowStr}  |  Total: ${total.toLocaleString()}  |  Activos: ${active.toLocaleString()}  |  Ausentes: ${absent.toLocaleString()}  |  Licencias/SPL: ${leave.toLocaleString()}`;
        
        const subRow = worksheet.addRow([subtitleText]);
        worksheet.mergeCells(2, 1, 2, TARGET_COLUMNS.length);
        subRow.height = 22;
        subRow.getCell(1).font = { name: 'Segoe UI', size: 10, italic: true, color: { argb: 'FF475569' } };
        subRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        subRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

        // 3. Fila separadora vacía
        const blankRow = worksheet.addRow([]);
        blankRow.height = 8;

        // 4. Cabeceras de Columnas
        const headerRow = worksheet.addRow(TARGET_COLUMNS);
        headerRow.height = 28;
        headerRow.eachCell((cell, colNumber) => {
          cell.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }; // Slate 800
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
          cell.border = {
            top: { style: 'medium', color: { argb: 'FF0F172A' } },
            left: { style: 'thin', color: { argb: 'FF334155' } },
            bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
            right: { style: 'thin', color: { argb: 'FF334155' } }
          };
        });

        // 5. Filas de Datos
        const thinBorder = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };

        const centerCols = new Set([
          'Tiene Digitacion (jornal)', 'RutTrabajador', 'CodigoTrabajador',
          'FechaNacimiento', 'Sexo', 'Edad', 'FechaInicioPeriodo',
          'FechaInicioContrato', 'FechaTerminoContrato', 'PLACA',
          'CODIGO BUS', 'TURNO', 'HASTA', 'ESTADO'
        ]);

        formattedExportData.forEach((item, index) => {
          const rowValues = TARGET_COLUMNS.map(col => item[col] !== undefined ? item[col] : '');
          const dataRow = worksheet.addRow(rowValues);
          dataRow.height = 21;

          const isEven = index % 2 === 0;
          const bgZebra = isEven ? 'FFFFFFFF' : 'FFF8FAFC';

          dataRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            const colName = TARGET_COLUMNS[colNumber - 1];
            cell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF1E293B' } };
            cell.border = thinBorder;
            
            // Alineación
            if (centerCols.has(colName)) {
              cell.alignment = { horizontal: 'center', vertical: 'middle' };
            } else {
              cell.alignment = { horizontal: 'left', vertical: 'middle' };
            }

            // Fondo por defecto
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgZebra } };

            // Estilos especiales
            if (colName === 'RutTrabajador') {
              cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF0F172A' } };
            } else if (colName === 'Apellidos y Nombres') {
              cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF1E293B' } };
            } else if (colName === 'Tiene Digitacion (jornal)') {
              const strVal = String(cell.value || '').toUpperCase();
              if (strVal.includes('SI') || strVal.includes('SÍ') || strVal === '1' || strVal === 'TRUE') {
                cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF15803D' } };
              }
            } else if (colName === 'ESTADO') {
              const statusStr = String(cell.value || '').toUpperCase().trim();
              if (statusStr === 'ACTIVO') {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } }; // Green 100
                cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF15803D' } }; // Green 700
                cell.border = {
                  top: { style: 'thin', color: { argb: 'FF86EFAC' } },
                  left: { style: 'thin', color: { argb: 'FF86EFAC' } },
                  bottom: { style: 'thin', color: { argb: 'FF86EFAC' } },
                  right: { style: 'thin', color: { argb: 'FF86EFAC' } }
                };
              } else if (statusStr === 'AUSENTE' || statusStr.includes('SIN MARCACIÓN') || statusStr.includes('SIN MARCACION')) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE4E6' } }; // Rose 100
                cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFBE123C' } }; // Rose 700
                cell.border = {
                  top: { style: 'thin', color: { argb: 'FFFCA5A5' } },
                  left: { style: 'thin', color: { argb: 'FFFCA5A5' } },
                  bottom: { style: 'thin', color: { argb: 'FFFCA5A5' } },
                  right: { style: 'thin', color: { argb: 'FFFCA5A5' } }
                };
              } else {
                // Licencia / Vacaciones / Permiso / etc.
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }; // Amber 100
                cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFB45309' } }; // Amber 700
                cell.border = {
                  top: { style: 'thin', color: { argb: 'FFFDE68A' } },
                  left: { style: 'thin', color: { argb: 'FFFDE68A' } },
                  bottom: { style: 'thin', color: { argb: 'FFFDE68A' } },
                  right: { style: 'thin', color: { argb: 'FFFDE68A' } }
                };
              }
            }
          });
        });

        // 6. Configurar AutoFiltro en la fila de cabeceras
        worksheet.autoFilter = {
          from: { row: 4, column: 1 },
          to: { row: 4 + formattedExportData.length, column: TARGET_COLUMNS.length }
        };

        // 7. Auto-ajuste inteligente de anchos de columna
        TARGET_COLUMNS.forEach((colName, colIdx) => {
          let maxLen = colName.length;
          formattedExportData.forEach(row => {
            const val = row[colName];
            if (val !== null && val !== undefined) {
              const len = String(val).length;
              if (len > maxLen) maxLen = len;
            }
          });
          const colLetter = worksheet.getColumn(colIdx + 1);
          colLetter.width = Math.min(Math.max(maxLen + 4, 13), 42);
        });

        // 8. Generar buffer y enviar a backend /api/save-excel (guardado directo en Descargas de Windows)
        const buffer = await workbook.xlsx.writeBuffer();
        
        let binaryStr = '';
        const byteArr = new Uint8Array(buffer);
        const chunkSz = 8192;
        for (let i = 0; i < byteArr.length; i += chunkSz) {
          binaryStr += String.fromCharCode.apply(null, byteArr.subarray(i, i + chunkSz));
        }
        const base64Data = window.btoa(binaryStr);

        let savedDirectly = false;
        try {
          const resp = await fetch('/api/save-excel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: fileName, base64: base64Data })
          });
          const resJson = await resp.json();
          if (resJson && resJson.success) {
            savedDirectly = true;
            playSuccessSound('chime');
            showToast(`✅ ¡Archivo Excel descargado con éxito!\nGuardado en: ${resJson.path || fileName}`, 'success');
          }
        } catch (postErr) {
          console.warn('Fallo al guardar por API local, usando descarga del navegador:', postErr);
        }

        // Descarga estándar en navegador como respaldo
        try {
          const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.setAttribute('download', fileName);
          document.body.appendChild(link);
          link.click();
          setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
          }, 300);
        } catch (_) {}

        if (!savedDirectly) {
          playSuccessSound('step');
          showToast(`Archivo Excel generado con estilos: ${fileName}`, 'success');
        }
        return;
      } catch (excelErr) {
        console.error('Error generando Excel con ExcelJS, usando SheetJS de respaldo:', excelErr);
      }
    }

    // Fallback a SheetJS si ExcelJS no está disponible
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
      
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
      let savedDirectly = false;
      try {
        const resp = await fetch('/api/save-excel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: fileName, base64: wbout })
        });
        const resJson = await resp.json();
        if (resJson && resJson.success) {
          savedDirectly = true;
          playSuccessSound('chime');
          showToast(`✅ ¡Archivo Excel descargado con éxito!\nGuardado en: ${resJson.path || fileName}`, 'success');
        }
      } catch (_) {}

      if (!savedDirectly) {
        XLSX.writeFile(wb, fileName);
        showToast(`Archivo Excel exportado: ${fileName}`, 'success');
      }
    } else if (format === 'csv') {
      const ws = XLSX.utils.json_to_sheet(formattedExportData, { header: TARGET_COLUMNS });
      const csvOutput = XLSX.utils.sheet_to_csv(ws);
      const csvBase64 = window.btoa(unescape(encodeURIComponent("\uFEFF" + csvOutput)));
      
      try {
        await fetch('/api/save-excel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: fileName, base64: csvBase64 })
        });
      } catch (_) {}

      const blob = new Blob(["\uFEFF" + csvOutput], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      setTimeout(() => document.body.removeChild(link), 300);
      showToast(`Archivo CSV exportado con éxito: ${fileName}`, 'success');
    }
  }

  // Load Demo Data
  function loadDemoData() {
    const demoTrabajadores = [
      { Empresa: 'SOCIEDAD EXPORTADORA VERFRUT S.A.C.', Regimen: 'Agrario', RutTrabajador: '70112233', CodigoTrabajador: 'TRAB-001', 'Ap.Paterno': 'Pérez', 'Ap. Materno': 'Ramos', Nombre: 'Juan Carlos', FechaNacimiento: '1992-04-15', Sexo: 'M', Edad: 34, FechaInicioPeriodo: '2026-01-01', FechaInicioContrato: '2022-03-15', FechaTerminoContrato: '2026-12-31', Oficio: 'Cosechador' },
      { Empresa: 'SOCIEDAD EXPORTADORA VERFRUT S.A.C.', Regimen: 'Agrario', RutTrabajador: '70223344', CodigoTrabajador: 'TRAB-002', 'Ap.Paterno': 'Rodríguez', 'Ap. Materno': 'Solís', Nombre: 'KASSANDRA EUFEMIA', FechaNacimiento: '1995-08-22', Sexo: 'F', Edad: 31, FechaInicioPeriodo: '2026-01-01', FechaInicioContrato: '2021-06-01', FechaTerminoContrato: '2026-12-31', Oficio: 'Seleccionadora' },
      { Empresa: 'SOCIEDAD EXPORTADORA VERFRUT S.A.C.', Regimen: 'General', RutTrabajador: '70334455', CodigoTrabajador: 'TRAB-003', 'Ap.Paterno': 'Sánchez', 'Ap. Materno': 'Morales', Nombre: 'Carlos Alberto', FechaNacimiento: '1988-11-03', Sexo: 'M', Edad: 37, FechaInicioPeriodo: '2026-01-01', FechaInicioContrato: '2020-01-10', FechaTerminoContrato: 'Indeterminado', Oficio: 'Supervisor de Campo' },
      { Empresa: 'SOCIEDAD EXPORTADORA VERFRUT S.A.C.', Regimen: 'Agrario', RutTrabajador: '70445566', CodigoTrabajador: 'TRAB-004', 'Ap.Paterno': 'Gómez', 'Ap. Materno': 'Torres', Nombre: 'Ana Lucía', FechaNacimiento: '1998-02-18', Sexo: 'F', Edad: 28, FechaInicioPeriodo: '2026-01-01', FechaInicioContrato: '2023-08-20', FechaTerminoContrato: '2026-12-31', Oficio: 'Empacadora' },
      { Empresa: 'SOCIEDAD EXPORTADORA VERFRUT S.A.C.', Regimen: 'Agrario', RutTrabajador: '70556677', CodigoTrabajador: 'TRAB-005', 'Ap.Paterno': 'Mendoza', 'Ap. Materno': 'Castro', Nombre: 'Luis Fernando', FechaNacimiento: '1990-07-30', Sexo: 'M', Edad: 36, FechaInicioPeriodo: '2026-01-01', FechaInicioContrato: '2019-11-05', FechaTerminoContrato: 'Indeterminado', Oficio: 'Técnico de Riego' },
      { Empresa: 'SOCIEDAD EXPORTADORA VERFRUT S.A.C.', Regimen: 'Agrario', RutTrabajador: '70667788', CodigoTrabajador: 'TRAB-006', 'Ap.Paterno': 'Vargas', 'Ap. Materno': 'Silva', Nombre: 'Patricia Sofía', FechaNacimiento: '1994-09-12', Sexo: 'F', Edad: 31, FechaInicioPeriodo: '2026-01-01', FechaInicioContrato: '2022-09-12', FechaTerminoContrato: '2026-12-31', Oficio: 'Evaluadora de Calidad' },
      { Empresa: 'SOCIEDAD AGRÍCOLA RAPEL S.A.C.', Regimen: 'Agrario', RutTrabajador: '70778899', CodigoTrabajador: 'TRAB-007', 'Ap.Paterno': 'Alva', 'Ap. Materno': 'Paredes', Nombre: 'Jorge Luis', FechaNacimiento: '1989-12-05', Sexo: 'M', Edad: 36, FechaInicioPeriodo: '2026-01-01', FechaInicioContrato: '2021-04-18', FechaTerminoContrato: '2026-12-31', Oficio: 'Conductor' },
      { Empresa: 'SOCIEDAD AGRÍCOLA RAPEL S.A.C.', Regimen: 'Agrario', RutTrabajador: '70889900', CodigoTrabajador: 'TRAB-008', 'Ap.Paterno': 'Fernández', 'Ap. Materno': 'Quintana', Nombre: 'Rosa María', FechaNacimiento: '1993-03-27', Sexo: 'F', Edad: 33, FechaInicioPeriodo: '2026-01-01', FechaInicioContrato: '2020-07-22', FechaTerminoContrato: 'Indeterminado', Oficio: 'Fitosanidad' },
      { Empresa: 'SOCIEDAD AGRÍCOLA RAPEL S.A.C.', Regimen: 'Agrario', RutTrabajador: '70990011', CodigoTrabajador: 'TRAB-009', 'Ap.Paterno': 'Chávez', 'Ap. Materno': 'Vega', Nombre: 'Diego Armando', FechaNacimiento: '1996-05-14', Sexo: 'M', Edad: 30, FechaInicioPeriodo: '2026-01-01', FechaInicioContrato: '2023-02-14', FechaTerminoContrato: '2026-12-31', Oficio: 'Estibador' },
      { Empresa: 'SOCIEDAD AGRÍCOLA RAPEL S.A.C.', Regimen: 'Agrario', RutTrabajador: '71001122', CodigoTrabajador: 'TRAB-010', 'Ap.Paterno': 'Navarro', 'Ap. Materno': 'Cruz', Nombre: 'Carmen Rosa', FechaNacimiento: '1991-10-08', Sexo: 'F', Edad: 34, FechaInicioPeriodo: '2026-01-01', FechaInicioContrato: '2022-10-01', FechaTerminoContrato: '2026-12-31', Oficio: 'Monitor SST' }
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

  
  // ==========================================================================
  // UNIFRUTTI ENTERPRISE DESKTOP APP CONTROLLER HELPERS
  // ==========================================================================

  function updateDesktopUIStatus() {
    const statusText = document.getElementById('sync-status-text');
    const headerStatus = document.getElementById('header-data-status');
    const statusbarRec = document.getElementById('statusbar-record-count');
    const tableFooterStatus = document.getElementById('table-footer-status');

    const total = state.consolidatedData ? state.consolidatedData.length : 0;
    const filtered = state.filteredData ? state.filteredData.length : 0;

    if (statusbarRec) {
      statusbarRec.textContent = `${filtered.toLocaleString()} / ${total.toLocaleString()}`;
    }

    if (headerStatus) {
      headerStatus.textContent = total > 0 ? `${total.toLocaleString()} registros consolidados` : 'Ningún archivo cargado';
    }

    if (statusText) {
      if (total > 0) {
        statusText.textContent = `Estado: Listo. ${filtered.toLocaleString()} filas visibles (${total.toLocaleString()} totales en memoria)`;
      } else if (state.file1.data && state.file1.data.length > 0) {
        statusText.textContent = `Estado: Datos cargados desde SQL Server (${state.file1.data.length.toLocaleString()} trabajadores). Listo para procesar cruce.`;
      } else {
        statusText.textContent = 'Estado: Listo para sincronizar';
      }
    }

    if (tableFooterStatus) {
      tableFooterStatus.textContent = total > 0 ? 'Registros procesados correctamente.' : 'Listo para procesar.';
    }
  }

  function populateFilterDropdowns() {
    const selEmpresa = document.getElementById('filter-empresa');
    const selCuartel = document.getElementById('filter-cuartel');
    const selRuta = document.getElementById('filter-ruta');
    if (!state.consolidatedData || state.consolidatedData.length === 0) return;

    if (selEmpresa) {
      const currentVal = selEmpresa.value;
      const empresas = new Set();
      state.consolidatedData.forEach(r => {
        if (r['Empresa'] && r['Empresa'] !== '-') empresas.add(r['Empresa']);
      });
      selEmpresa.innerHTML = '<option value="">🏢 Todas las Empresas</option>';
      Array.from(empresas).sort().forEach(emp => {
        const opt = document.createElement('option');
        opt.value = emp;
        opt.textContent = emp;
        if (emp === currentVal) opt.selected = true;
        selEmpresa.appendChild(opt);
      });
    }

    if (selCuartel) {
      const currentVal = selCuartel.value;
      const zonas = new Set();
      state.consolidatedData.forEach(r => {
        if (r['Zona Labores'] && r['Zona Labores'] !== '-') zonas.add(r['Zona Labores']);
        if (r['SubCentroCosto / Cuartel'] && r['SubCentroCosto / Cuartel'] !== '-') zonas.add(r['SubCentroCosto / Cuartel']);
      });
      selCuartel.innerHTML = '<option value="">Todas las Zonas / Fundos</option>';
      Array.from(zonas).sort().forEach(z => {
        const opt = document.createElement('option');
        opt.value = z;
        opt.textContent = z;
        if (z === currentVal) opt.selected = true;
        selCuartel.appendChild(opt);
      });
    }

    if (selRuta) {
      const currentVal = selRuta.value;
      const rutas = new Set();
      state.consolidatedData.forEach(r => {
        if (r['RUTA'] && r['RUTA'] !== '-') rutas.add(r['RUTA']);
      });
      selRuta.innerHTML = '<option value="">Todas las Rutas</option>';
      Array.from(rutas).sort().forEach(rt => {
        const opt = document.createElement('option');
        opt.value = rt;
        opt.textContent = rt;
        if (rt === currentVal) opt.selected = true;
        selRuta.appendChild(opt);
      });
    }
  }

  // Multi-Selección de Empresas con Presets y Filtro de Búsqueda
  function setupEmpresaMultiSelect() {
    const container = document.getElementById('quick-empresa-multiselect');
    const trigger = document.getElementById('quick-empresa-trigger');
    const badge = document.getElementById('quick-empresa-badge');
    const textLabel = document.getElementById('quick-empresa-text');
    const dropdown = document.getElementById('quick-empresa-dropdown');
    const searchInput = document.getElementById('quick-empresa-search');
    const optionsList = document.getElementById('quick-empresa-options-list');
    const hiddenSelect = document.getElementById('quick-param-empresa');
    const advSelect = document.getElementById('adv-param-empresa');

    const btnAll = document.getElementById('btn-ms-all');
    const btnVerfrut = document.getElementById('btn-ms-verfrut');
    const btnRapel = document.getElementById('btn-ms-rapel');
    const btnPeru = document.getElementById('btn-ms-peru');
    const btnClear = document.getElementById('btn-ms-clear');

    if (!container || !optionsList) return;

    // Poblar la lista de opciones (14 Verfrut primero, 9 Rapel segundo)
    optionsList.innerHTML = '';
    const sortedEmpresas = [
      ['14', 'SOCIEDAD EXPORTADORA VERFRUT S. A. C.'],
      ['9', 'SOCIEDAD AGRÍCOLA RAPEL S. A. C.']
    ];

    sortedEmpresas.forEach(([code, name]) => {
      const isDefault = code === '14'; // Verfrut por defecto
      const optDiv = document.createElement('label');
      optDiv.className = 'multi-select-option-item' + (isDefault ? ' selected' : '');
      optDiv.dataset.code = code;
      optDiv.dataset.name = name.toLowerCase();
      optDiv.innerHTML = `
        <input type="checkbox" class="empresa-checkbox" value="${code}" ${isDefault ? 'checked' : ''}>
        <span class="ms-code-badge">${code}</span>
        <span class="ms-emp-name">${escapeHtml(name)}</span>
      `;
      optionsList.appendChild(optDiv);
    });

    function updateMultiSelectDisplay() {
      const checkboxes = Array.from(optionsList.querySelectorAll('.empresa-checkbox'));
      const checkedBoxes = checkboxes.filter(cb => cb.checked);
      const checkedValues = checkedBoxes.map(cb => cb.value);
      const count = checkedBoxes.length;

      checkboxes.forEach(cb => {
        const itemLabel = cb.closest('.multi-select-option-item') || cb.parentElement;
        if (itemLabel) itemLabel.classList.toggle('selected', cb.checked);
      });

      if (badge) {
        badge.textContent = count;
        if (count === 0) {
          badge.classList.add('zero');
        } else {
          badge.classList.remove('zero');
        }
      }

      if (textLabel) {
        if (count === 0) {
          textLabel.textContent = 'Ninguna empresa seleccionada';
        } else if (count === 1) {
          const code = checkedValues[0];
          textLabel.textContent = `${code} - ${EMPRESAS_MAP[code] || ('Empresa ' + code)}`;
        } else if (count >= 2) {
          textLabel.textContent = 'Verfrut + Rapel (Ambas)';
        } else {
          textLabel.textContent = `${count} Empresas (${checkedValues.join(', ')})`;
        }
      }

      // Sincronizar select oculto quick-param-empresa
      if (hiddenSelect) {
        Array.from(hiddenSelect.options).forEach(opt => {
          opt.selected = checkedValues.includes(opt.value);
        });
      }

      // Sincronizar select modal avanzado si existe
      if (advSelect) {
        Array.from(advSelect.options).forEach(opt => {
          opt.selected = checkedValues.includes(opt.value);
        });
      }

      updateSyncChips();
    }

    // Toggle dropdown
    if (trigger) {
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = dropdown.style.display !== 'none' && dropdown.style.display !== '';
        dropdown.style.display = isOpen ? 'none' : 'block';
        trigger.classList.toggle('active', !isOpen);
      });
    }

    // Cerrar al hacer clic fuera
    document.addEventListener('click', (e) => {
      if (container && !container.contains(e.target)) {
        if (dropdown) dropdown.style.display = 'none';
        if (trigger) trigger.classList.remove('active');
      }
    });

    // Cerrar con tecla Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && dropdown && dropdown.style.display !== 'none') {
        dropdown.style.display = 'none';
        if (trigger) trigger.classList.remove('active');
      }
    });

    // Filtro de búsqueda en tiempo real
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const query = (e.target.value || '').trim().toLowerCase();
        const items = optionsList.querySelectorAll('.multi-select-option');
        items.forEach(item => {
          const code = item.dataset.code || '';
          const name = item.dataset.name || '';
          if (!query || code.includes(query) || name.includes(query)) {
            item.style.display = 'flex';
          } else {
            item.style.display = 'none';
          }
        });
      });
    }

    // Event delegation para los checkboxes
    optionsList.addEventListener('change', (e) => {
      if (e.target.classList.contains('empresa-checkbox')) {
        updateMultiSelectDisplay();
      }
    });

    // Presets rápidos (Verfrut y Rapel)
    if (btnAll) {
      btnAll.addEventListener('click', () => {
        optionsList.querySelectorAll('.empresa-checkbox').forEach(cb => { cb.checked = true; });
        updateMultiSelectDisplay();
      });
    }

    if (btnVerfrut) {
      btnVerfrut.addEventListener('click', () => {
        optionsList.querySelectorAll('.empresa-checkbox').forEach(cb => {
          cb.checked = (cb.value === '14');
        });
        updateMultiSelectDisplay();
      });
    }

    if (btnRapel) {
      btnRapel.addEventListener('click', () => {
        optionsList.querySelectorAll('.empresa-checkbox').forEach(cb => {
          cb.checked = (cb.value === '9');
        });
        updateMultiSelectDisplay();
      });
    }

    if (btnPeru) {
      btnPeru.addEventListener('click', () => {
        optionsList.querySelectorAll('.empresa-checkbox').forEach(cb => {
          cb.checked = (cb.value === '14' || cb.value === '9');
        });
        updateMultiSelectDisplay();
      });
    }

    if (btnClear) {
      btnClear.addEventListener('click', () => {
        optionsList.querySelectorAll('.empresa-checkbox').forEach(cb => { cb.checked = false; });
        updateMultiSelectDisplay();
      });
    }

    // Inicializar visualización con los checkboxes por defecto
    updateMultiSelectDisplay();
  }

  function setupDesktopUI() {
    const btnSyncSql = document.getElementById('btn-header-sync-sql');
    const btnProcess = document.getElementById('btn-header-process');
    const btnExport = document.getElementById('btn-header-export-excel');
    const btnSqlParams = document.getElementById('btn-header-sql-params');
    const btnQuickParams = document.getElementById('btn-quick-sync-params');
    const btnFilterNoTrans = document.getElementById('btn-filter-no-transporte');
    const selEmpresa = document.getElementById('filter-empresa');
    const selRuta = document.getElementById('filter-ruta');
    const selCuartel = document.getElementById('filter-cuartel');
    const btnClearFilters = document.getElementById('btn-clear-filters');

    // Inicializar multi-select de Empresas en Toolbar
    try {
      setupEmpresaMultiSelect();
    } catch (e) {
      console.error('Error setupEmpresaMultiSelect:', e);
    }

    // Selectores rápidos del Toolbar
    const quickEmp = document.getElementById('quick-param-empresa');
    const quickMes = document.getElementById('quick-param-mes');
    const quickAnio = document.getElementById('quick-param-anio');
    const quickDias = document.getElementById('quick-param-dias');

    // Sincronizar SQL
    if (btnSyncSql) {
      btnSyncSql.addEventListener('click', () => {
        loadAllFromSqlServer();
      });
    }

    // Procesar Cruce (Recalcular si el usuario ajusta parámetros)
    if (btnProcess) {
      btnProcess.addEventListener('click', () => {
        if (!state.file1.data || state.file1.data.length === 0) {
          showToast('Primero presione "⚡ Sincronizar SQL" para cargar las asistencias.', 'info');
          return;
        }
        showToast('🔄 Recalculando cruce de 23 columnas consolidadas...', 'info');
        handleProcessData();
      });
    }

    // Exportar Reporte Excel
    if (btnExport) {
      btnExport.addEventListener('click', () => {
        if (!state.consolidatedData || state.consolidatedData.length === 0) {
          if (state.file1.data && state.file1.data.length > 0) {
            handleProcessData();
            setTimeout(() => exportData('xlsx'), 400);
          } else {
            showToast('Primero sincronice con "⚡ Sincronizar SQL" para generar el reporte.', 'info');
          }
        } else {
          showToast('📥 Generando archivo Excel consolidado...', 'info');
          exportData('xlsx');
        }
      });
    }

    // Parámetros de Sincronización SQL (Modal de Más Parámetros)
    const modalParamsConfig = document.getElementById('modal-sync-params-config');
    const advEmpresa = document.getElementById('adv-param-empresa');
    const advMes = document.getElementById('adv-param-mes');
    const advAnio = document.getElementById('adv-param-anio');
    const advDias = document.getElementById('adv-param-dias');
    const advFechaini = document.getElementById('adv-param-fechaini');
    const advActivo = document.getElementById('adv-param-activo');
    const btnCloseParamsConfig = document.getElementById('btn-close-sync-params-config');
    const btnCancelParamsConfig = document.getElementById('btn-cancel-sync-params-config');
    const btnSaveSyncParamsOnly = document.getElementById('btn-save-sync-params-only');
    const btnSaveAndSyncParams = document.getElementById('btn-save-and-sync-params');
    const formSyncParamsConfig = document.getElementById('form-sync-params-config');

    // Recalcular automáticamente fecha de corte en el modal cuando cambia mes o año
    const updateAdvFechaini = () => {
      if (!advFechaini || !advMes || !advAnio) return;
      const m = parseInt(advMes.value, 10);
      const a = parseInt(advAnio.value, 10);
      let lastDay = 31;
      if (m === 2) {
        lastDay = (a % 4 === 0 && (a % 100 !== 0 || a % 400 === 0)) ? 29 : 28;
      } else if ([4, 6, 9, 11].includes(m)) {
        lastDay = 30;
      }
      advFechaini.value = `${lastDay}/${m}/${a}`;
    };

    if (advMes) advMes.addEventListener('change', updateAdvFechaini);
    if (advAnio) advAnio.addEventListener('input', updateAdvFechaini);

    // Eventos al cambiar directamente en la barra rápida del toolbar
    const handleQuickDateChange = () => {
      const m = parseInt(quickMes ? quickMes.value : '1', 10);
      const a = parseInt(quickAnio ? quickAnio.value : '2026', 10);
      if (isNaN(m) || isNaN(a)) return;

      if (advMes) advMes.value = String(m);
      if (advAnio) advAnio.value = String(a);

      if (elements.sqlParamMes) elements.sqlParamMes.value = String(m);
      if (elements.sqlParamAnio) elements.sqlParamAnio.value = String(a);
      if (elements.sqlParam2Mes) elements.sqlParam2Mes.value = String(m);
      if (elements.sqlParam2Anio) elements.sqlParam2Anio.value = String(a);
      if (elements.syncAllMasterMes) elements.syncAllMasterMes.value = String(m);
      if (elements.syncAllMasterAnio) elements.syncAllMasterAnio.value = String(a);

      calculateAndSetSyncAllDates(m, a);
      updateSyncChips();
    };

    if (quickMes) quickMes.addEventListener('change', handleQuickDateChange);
    if (quickAnio) {
      quickAnio.addEventListener('change', handleQuickDateChange);
      quickAnio.addEventListener('input', handleQuickDateChange);
    }
    if (quickDias) {
      quickDias.addEventListener('change', () => {
        if (advDias) advDias.value = quickDias.value;
        updateSyncChips();
      });
    }

    const openSyncParamsModal = () => {
      if (advEmpresa) {
        const selected = getSelectedEmpresas();
        Array.from(advEmpresa.options).forEach(opt => {
          opt.selected = selected.includes(opt.value);
        });
      }
      if (advMes && quickMes) advMes.value = quickMes.value;
      if (advAnio && quickAnio) advAnio.value = quickAnio.value;
      if (advDias && quickDias) advDias.value = quickDias.value;

      updateAdvFechaini();

      if (modalParamsConfig) {
        openModal(modalParamsConfig);
      } else if (elements.modalSqlSyncAll) {
        openModal(elements.modalSqlSyncAll);
      }
    };

    if (btnSqlParams) btnSqlParams.addEventListener('click', openSyncParamsModal);
    if (btnQuickParams) btnQuickParams.addEventListener('click', openSyncParamsModal);

    if (btnCloseParamsConfig && modalParamsConfig) {
      btnCloseParamsConfig.addEventListener('click', () => closeModal(modalParamsConfig));
    }
    if (btnCancelParamsConfig && modalParamsConfig) {
      btnCancelParamsConfig.addEventListener('click', () => closeModal(modalParamsConfig));
    }

    const saveParamsOnly = (e) => {
      if (e) e.preventDefault();
      try {
        if (advEmpresa) {
          const advSelected = Array.from(advEmpresa.selectedOptions || []).map(o => o.value);
          if (advSelected.length > 0) {
            const listContainer = document.getElementById('quick-empresa-options-list');
            if (listContainer) {
              listContainer.querySelectorAll('.empresa-checkbox').forEach(cb => {
                cb.checked = advSelected.includes(cb.value);
              });
              const ev = new Event('change', { bubbles: true });
              listContainer.dispatchEvent(ev);
            }
          }
        }
        if (quickMes && advMes) quickMes.value = advMes.value;
        if (quickAnio && advAnio) quickAnio.value = advAnio.value;
        if (quickDias && advDias) quickDias.value = advDias.value;

        const m = parseInt((advMes && advMes.value) || '1', 10);
        const a = parseInt((advAnio && advAnio.value) || String(new Date().getFullYear()), 10);
        calculateAndSetSyncAllDates(m, a);

        // Si el usuario editó la fecha de corte manualmente en advFechaini, respetarla
        if (advFechaini && advFechaini.value.trim()) {
          const customFecha = advFechaini.value.trim();
          if (elements.syncAllP1Fechaini) elements.syncAllP1Fechaini.value = customFecha;
          if (elements.sqlParamFechaini) elements.sqlParamFechaini.value = customFecha;
        }

        updateSyncChips();

        if (modalParamsConfig) closeModal(modalParamsConfig);
        showToast('✅ Parámetros guardados correctamente.', 'success');
      } catch (err) {
        console.error('Error al guardar parámetros:', err);
        if (modalParamsConfig) closeModal(modalParamsConfig);
        showToast('Parámetros actualizados.', 'success');
      }
    };

    const applyAndSyncParams = (e) => {
      if (e) e.preventDefault();
      saveParamsOnly();
      showToast('Iniciando sincronización con los parámetros guardados...', 'info');
      loadAllFromSqlServer();
    };

    if (btnSaveSyncParamsOnly) btnSaveSyncParamsOnly.addEventListener('click', saveParamsOnly);
    if (btnSaveAndSyncParams) btnSaveAndSyncParams.addEventListener('click', applyAndSyncParams);
    if (formSyncParamsConfig) formSyncParamsConfig.addEventListener('submit', applyAndSyncParams);

    // Monitor de Sincronización: Cerrar / Ver Resultados
    const modalSyncMonitor = document.getElementById('modal-sync-live-monitor');
    const btnCloseSyncMonitor = document.getElementById('btn-close-sync-monitor');
    const btnViewSyncResults = document.getElementById('btn-sync-monitor-view-results');

    if (btnCloseSyncMonitor && modalSyncMonitor) {
      btnCloseSyncMonitor.addEventListener('click', () => closeModal(modalSyncMonitor));
    }
    if (btnViewSyncResults && modalSyncMonitor) {
      btnViewSyncResults.addEventListener('click', () => {
        closeModal(modalSyncMonitor);
        if (state.consolidatedData && state.consolidatedData.length > 0) {
          renderTable();
        }
      });
    }

    // Modal de Usuario y Conexión BD (Verificar usuario gpanta y editar credenciales)
    const openUserConfigModal = async () => {
      const modal = elements.modalSqlDbConfig || document.getElementById('modal-sql-db-config');
      if (modal) {
        openModal(modal);
        await loadSqlDatabaseConfig();
      }
    };

    const btnHeaderUserConfig = document.getElementById('btn-header-user-config');
    if (btnHeaderUserConfig) {
      btnHeaderUserConfig.addEventListener('click', openUserConfigModal);
    }

    const sidebarUserCard = document.getElementById('sidebar-user-card-clickable');
    if (sidebarUserCard) {
      sidebarUserCard.addEventListener('click', openUserConfigModal);
    }

    // Sincronización entre selector de Empresa del toolbar
    if (quickEmp) {
      quickEmp.addEventListener('change', (e) => {
        const val = e.target.value;
        syncAllCompanyInputs(val);
        updateSyncChips();
        showToast(`Empresa seleccionada: ${quickEmp.options[quickEmp.selectedIndex].text}`, 'info');
      });
    }

    if (btnFilterNoTrans) {
      btnFilterNoTrans.addEventListener('click', () => {
        state.filterSinTransporte = !state.filterSinTransporte;
        btnFilterNoTrans.classList.toggle('active', state.filterSinTransporte);
        applyFilters();
      });
    }

    if (selEmpresa) {
      selEmpresa.addEventListener('change', (e) => {
        state.filterEmpresa = e.target.value;
        applyFilters();
      });
    }

    if (selRuta) {
      selRuta.addEventListener('change', (e) => {
        state.filterRuta = e.target.value;
        applyFilters();
      });
    }

    if (selCuartel) {
      selCuartel.addEventListener('change', (e) => {
        state.filterCuartel = e.target.value;
        applyFilters();
      });
    }

    if (btnClearFilters) {
      btnClearFilters.addEventListener('click', () => {
        if (elements.tableSearch) elements.tableSearch.value = '';
        state.searchTerm = '';
        state.activeFilter = 'ALL';
        state.filterEmpresa = '';
        state.filterCuartel = '';
        state.filterRuta = '';
        state.filterSinTransporte = false;
        if (selEmpresa) selEmpresa.value = '';
        if (selCuartel) selCuartel.value = '';
        if (selRuta) selRuta.value = '';
        if (btnFilterNoTrans) btnFilterNoTrans.classList.remove('active');
        applyFilters();
      });
    }

    // Functional Sidebar navigation buttons
    const navAsistencia = document.getElementById('nav-control-asistencia');
    const navConfigBd = document.getElementById('nav-config-bd');
    const navDemoData = document.getElementById('nav-demo-data');
    const navAyudaGuia = document.getElementById('nav-ayuda-guia');

    if (navAsistencia) {
      navAsistencia.addEventListener('click', () => {
        document.querySelectorAll('.sidebar-nav-item').forEach(b => b.classList.remove('active'));
        navAsistencia.classList.add('active');
        state.activeFilter = 'ALL';
        applyFilters();
      });
    }

    if (navConfigBd) {
      navConfigBd.addEventListener('click', openUserConfigModal);
    }

    if (navDemoData) {
      navDemoData.addEventListener('click', () => {
        loadDemoData();
      });
    }

    if (navAyudaGuia) {
      navAyudaGuia.addEventListener('click', () => {
        if (elements.modalHelp) openModal(elements.modalHelp);
      });
    }

    // Functional Sidebar Collapse & Expand Toggle Controller
    const btnSidebarCollapse = document.getElementById('btn-sidebar-collapse');
    const btnSidebarToggle = document.getElementById('btn-sidebar-toggle');
    const toggleSidebar = () => {
      const isCollapsed = document.body.classList.toggle('sidebar-collapsed');
      try {
        localStorage.setItem('sidebar_collapsed', isCollapsed ? '1' : '0');
      } catch (e) {}
      if (btnSidebarCollapse) {
        btnSidebarCollapse.setAttribute('aria-expanded', String(!isCollapsed));
        btnSidebarCollapse.title = isCollapsed ? 'Expandir menú lateral (Ctrl+B)' : 'Colapsar menú lateral (Ctrl+B)';
      }
    };

    if (btnSidebarCollapse) {
      btnSidebarCollapse.addEventListener('click', (e) => {
        e.preventDefault();
        toggleSidebar();
      });
    }

    if (btnSidebarToggle) {
      btnSidebarToggle.addEventListener('click', (e) => {
        e.preventDefault();
        toggleSidebar();
      });
    }

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        toggleSidebar();
      }
    });

    try {
      if (localStorage.getItem('sidebar_collapsed') === '1') {
        document.body.classList.add('sidebar-collapsed');
        if (btnSidebarCollapse) {
          btnSidebarCollapse.setAttribute('aria-expanded', 'false');
          btnSidebarCollapse.title = 'Expandir menú lateral (Ctrl+B)';
        }
      }
    } catch (e) {}

    // Backdrop click handlers for new modals
    [modalParamsConfig, modalSyncMonitor].forEach(modal => {
      if (!modal) return;
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal(modal);
      });
    });

    // Inicializar parámetros dinámicos con el mes y año actual
    try {
      initializeDynamicDateParams();
    } catch (e) {
      console.error('Error initializeDynamicDateParams in setupDesktopUI:', e);
    }

    // Initial render of table header so columns display immediately
    renderTableHeader();
    updateDesktopUIStatus();
  }


  function startup() {
    try {
      init();
    } catch (e) {
      console.error('Fatal error during init():', e);
    }
    try {
      setupDesktopUI();
    } catch (e) {
      console.error('Fatal error during setupDesktopUI():', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startup);
  } else {
    startup();
  }
})();
