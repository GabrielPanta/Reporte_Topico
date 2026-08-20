# 📊 Consolidador de Personal, Labores y Marcaciones

Aplicación web moderna y rápida para procesar, cruzar y exportar automáticamente el consolidado de personal con los **23 campos exactos requeridos**.

---

## 📋 Estructura Exacta del Consolidado Exportado

El archivo final exportado contiene las siguientes 23 columnas en orden:

| # | Columna Requerida | Origen Principal |
|---|---|---|
| **1** | `Regimen` | Archivo 1 (Trabajadores) |
| **2** | `Tiene Digitacion (jornal)` | Archivo 2 (Último Día & Labores) |
| **3** | `RutTrabajador` | Archivo 1 / 2 / 3 (DNI / RUT) |
| **4** | `CodigoTrabajador` | Archivo 1 (Código / Ficha) |
| **5** | `Apellidos y Nombres` | Archivo 1 (Concatenación o directo) |
| **6** | `FechaNacimiento` | Archivo 1 |
| **7** | `Sexo` | Archivo 1 |
| **8** | `Edad` | Archivo 1 |
| **9** | `FechaInicioPeriodo` | Archivo 1 |
| **10** | `FechaInicioContrato` | Archivo 1 |
| **11** | `FechaTerminoContrato` | Archivo 1 |
| **12** | `Oficio` | Archivo 1 (Cargo / Puesto / Ocupación) |
| **13** | `Zona Labores` | Archivo 2 (Fundo / Sede / Campo) |
| **14** | `SubCentroCosto / Cuartel` | Archivo 2 (Cuartel / Línea / CeCo) |
| **15** | `ACTIVIDAD` | Archivo 2 (Labor / Motivo / Condición) |
| **16** | `LABOR` | Archivo 2 (Detalle labor) |
| **17** | `ENCARGADO` | Archivo 2 (Supervisor / Capataz) |
| **18** | `PLACA` | Archivo 2 |
| **19** | `CODIGO BUS` | Archivo 2 |
| **20** | `RUTA` | Archivo 2 |
| **21** | `TURNO` | Archivo 2 |
| **22** | `HASTA` | Archivo 2 (Vigencia de descanso/licencia/labor) |
| **23** | **`ESTADO`** | **Campo Calculado** |

---

## ⚙️ Regla de Evaluación de Estado

- **¿El trabajador tiene marcación de asistencia en el Archivo 3?**  
  👉 **`ESTADO = ACTIVO`**
- **¿El trabajador NO tiene marcación en el Archivo 3?**  
  👉 **`ESTADO = [Valor de la columna ACTIVIDAD]`** *(ej. "LICENCIA POR MATERNIDAD", "DESCANSO MÉDICO", "VACACIONES", "LICENCIA POR PATERNIDAD", etc.)*

---

## 🚀 Cómo Iniciar la Aplicación

1. **Con el archivo de inicio:** Haz doble clic en **`iniciar.bat`** para abrir el navegador en `http://localhost:8000`.
2. **Directo en el navegador:** Haz doble clic en **`index.html`** con Chrome, Edge o Firefox.
3. **Prueba rápida:** Haz clic en el botón superior **"Cargar Datos de Ejemplo"** para probar la consolidación completa al instante.
4. **Descargar:** Haz clic en **"Descargar Excel (.xlsx)"** para obtener el archivo con formato listo.
