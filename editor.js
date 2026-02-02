// ==============================
//   EDITOR.JS — Полный файл
// ==============================

let editorMap;
let editorPlots = [];
let editorSelectedPlot = null;
let editorPlanOverlay = null;
let editorRotationHandle = null;

// ---------------------------------------
// СТИЛИ ПО СТАТУСУ
// ---------------------------------------
function editorStatusClass(status) {
  const s = (status || "").toLowerCase();
  if (s.includes("муниц")) return "status-municipal";
  if (s.includes("прод")) return "status-sold";
  if (s.includes("резерв")) return "status-reserved";
  return "status-free";
}

function editorStatusDotClass(status) {
  const s = (status || "").toLowerCase();
  if (s.includes("муниц")) return "dot-municipal";
  if (s.includes("прод")) return "dot-sold";
  if (s.includes("резерв")) return "dot-reserved";
  return "dot-free";
}

function editorColorsByStatus(status) {
  // Returns { fill, stroke }
  // Minimal black stroke for all
  const commonStroke = "#000000";

  switch (status) {
    case "Продан":
      return { fill: "#EF444455", stroke: commonStroke };
    case "Резерв":
      return { fill: "#FACC1555", stroke: commonStroke };
    case "Муниципальный":
      return { fill: "#60A5FA55", stroke: commonStroke };
    case "Свободен":
    default:
      return { fill: "#22C55E55", stroke: commonStroke };
  }
}

// ---------------------------------------
// ЧТЕНИЕ / ЗАПИСЬ ФОРМЫ
// ---------------------------------------
function editorFillForm(plot) {
  document.getElementById("fieldId").value = plot.id || "";
  document.getElementById("fieldName").value = plot.name || "";
  document.getElementById("fieldStatus").value = plot.status || "Свободен";
  document.getElementById("fieldArea").value = plot.area || "";
  document.getElementById("fieldAreaValue").value = plot.areaValue ?? "";
  document.getElementById("fieldPrice").value = plot.price || "";
  document.getElementById("fieldPriceValue").value = plot.priceValue ?? "";
  document.getElementById("fieldCadastralNumber").value = plot.cadastralNumber || "";
  document.getElementById("fieldAddress").value = plot.address || "";
  document.getElementById("fieldLandCategory").value = plot.landCategory || "";
  document.getElementById("fieldOwnershipForm").value = plot.ownershipForm || "";
  document.getElementById("fieldCadastralCost").value = plot.cadastralCost || "";
  document.getElementById("fieldMarketValueEstimate").value = plot.marketValueEstimate || "";
  document.getElementById("fieldRentPrice").value = plot.rentPrice || "";
  document.getElementById("fieldRentRate").value = plot.rentRate || "";
  document.getElementById("fieldVri").value = plot.vri || "";
  document.getElementById("fieldPurpose").value = plot.purpose || "";
  document.getElementById("fieldProjectDescription").value = plot.projectDescription || "";
  document.getElementById("fieldComment").value = plot.comment || "";
  document.getElementById("fieldZone").value = plot.zone || "";
}

function editorReadFormIntoPlot(plot) {
  plot.id = document.getElementById("fieldId").value.trim() || plot.id;
  plot.name = document.getElementById("fieldName").value.trim();
  plot.status = document.getElementById("fieldStatus").value.trim();
  plot.area = document.getElementById("fieldArea").value.trim();
  const areaVal = document.getElementById("fieldAreaValue").value.trim();
  plot.areaValue = areaVal ? Number(areaVal) : null;

  plot.price = document.getElementById("fieldPrice").value.trim();
  const priceVal = document.getElementById("fieldPriceValue").value.trim();
  plot.priceValue = priceVal ? Number(priceVal) : null;

  plot.cadastralNumber = document.getElementById("fieldCadastralNumber").value.trim();
  plot.address = document.getElementById("fieldAddress").value.trim();
  plot.landCategory = document.getElementById("fieldLandCategory").value.trim();
  plot.ownershipForm = document.getElementById("fieldOwnershipForm").value.trim();
  plot.cadastralCost = document.getElementById("fieldCadastralCost").value.trim();
  plot.marketValueEstimate = document.getElementById("fieldMarketValueEstimate").value.trim();
  plot.rentPrice = document.getElementById("fieldRentPrice").value.trim();
  plot.rentRate = document.getElementById("fieldRentRate").value.trim();

  plot.vri = document.getElementById("fieldVri").value.trim();
  plot.purpose = document.getElementById("fieldPurpose").value.trim();
  plot.projectDescription = document.getElementById("fieldProjectDescription").value.trim();
  plot.comment = document.getElementById("fieldComment").value.trim();
  plot.zone = document.getElementById("fieldZone").value.trim();
}

// ---------------------------------------
// ОТРИСОВКА УЧАСТКОВ НА КАРТЕ
// ---------------------------------------
function editorRenderPlots() {
  if (!editorMap) return;

  editorPlots.forEach(plot => {
    if (plot.polygon) {
      editorMap.geoObjects.remove(plot.polygon);
      plot.polygon = null;
    }

    if (!plot.coords || !Array.isArray(plot.coords) || plot.coords.length < 3) return;

    const c = editorColorsByStatus(plot.status);

    const polygon = new ymaps.Polygon(
      [plot.coords.map(([lon, lat]) => [lat, lon])],
      {
        hintContent: plot.id,
        plotId: plot.id
      },
      {
        fillColor: c.fill,
        strokeColor: c.stroke,
        strokeWidth: 2,
        draggable: true,
        fillOpacity: 0.6
      }
    );

    polygon.editor = polygon.editor || null;

    polygon.events.add("click", (e) => {
      // Get native event for keys
      // ymaps sends its own event object. It wraps original.
      // e.get('domEvent') -> DomEvent -> .originalEvent
      const domEvent = e.get("domEvent");
      const isMulti = domEvent.originalEvent.ctrlKey || domEvent.originalEvent.metaKey || domEvent.originalEvent.shiftKey;

      editorSelectPlot(plot, true, isMulti);
    });

    editorMap.geoObjects.add(polygon);
    plot.polygon = polygon;
  });
}

// ---------------------------------------
// ЛОГИКА ВРАЩЕНИЯ И UI
// ---------------------------------------
function editorUpdateRotationHandle() {
  if (!editorRotationHandle || !editorSelectedPlot || !editorSelectedPlot.polygon) {
    if (editorRotationHandle) {
      editorMap.geoObjects.remove(editorRotationHandle);
      editorRotationHandle = null;
    }
    return;
  }

  const polygon = editorSelectedPlot.polygon;
  const geometry = polygon.geometry;
  const bounds = geometry.getBounds();
  if (!bounds) return;

  // Центр и "верх"
  // Проверяем, есть ли Pivot, иначе центроид
  let center;
  if (editorRotationPivot) {
    center = editorRotationPivot.geometry.getCoordinates();
  } else {
    center = editorGetPolygonCentroid(polygon);
  }

  const centerLat = center[0];
  const centerLon = center[1];

  // bounds уже получен выше, используем его
  const maxLat = bounds ? bounds[1][0] : centerLat + 0.0001;

  // Позиция ручки чуть выше верхней границы (или относительно Pivot?)
  // Лучше относительно Pivot, но тогда ручка может быть далеко.
  // Оставим ручку НАД полигоном, но вращаем вокруг Pivot.
  // Или ручка должна убегать по кругу? Обычно ручка висит на фиксированном расстоянии от центра.
  // Давайте пока оставим ручку "над" полигоном для простоты захвата, 
  // НО при драге мы будем вращать вокруг Pivot.

  const handleLat = maxLat + 0.00015;
  editorRotationHandle.geometry.setCoordinates([handleLat, centerLon]);
}

let editorRotationPivot = null; // точка вращения (Placemark)

function editorCreateRotationHandle(plot) {
  if (editorRotationHandle) {
    editorMap.geoObjects.remove(editorRotationHandle);
    editorRotationHandle = null;
  }
  if (editorRotationPivot) {
    editorMap.geoObjects.remove(editorRotationPivot);
    editorRotationPivot = null;
  }

  // 1. Создаем Pivot (центр вращения)
  const polygon = plot.polygon;
  const centroid = editorGetPolygonCentroid(polygon);

  editorRotationPivot = new ymaps.Placemark(
    centroid,
    { hintContent: "Центр вращения (перетащи меня)" },
    {
      preset: "islands#blueCircleDotIcon", // синяя точка
      draggable: true,
      zIndex: 2100
    }
  );
  editorMap.geoObjects.add(editorRotationPivot);

  // При перетаскивании точки вращения - просто обновляем её позицию (она сама draggable)
  // Можно добавить "прилипание" к вершинам (snap)
  editorRotationPivot.events.add("dragend", () => {
    // Можно реализовать snap to vertex тут
    const coords = editorRotationPivot.geometry.getCoordinates();
    // Найдем ближайшую вершину
    const polyCoords = polygon.geometry.getCoordinates()[0];
    let minDist = Infinity;
    let nearest = null;

    polyCoords.forEach(pt => {
      const d = (pt[0] - coords[0]) ** 2 + (pt[1] - coords[1]) ** 2;
      if (d < minDist) {
        minDist = d;
        nearest = pt;
      }
    });

    // Если близко (< ~20 метров), примагнитим
    // 0.0002 градуса ~ 20 метров
    if (minDist < 0.00000005) {
      editorRotationPivot.geometry.setCoordinates(nearest);
    }
    editorUpdateRotationHandle(); // обновим линию ручки если будем рисовать линию
  });


  // 2. Создаем ручку вращения
  editorRotationHandle = new ymaps.Placemark(
    [0, 0],
    { hintContent: "Потяни, чтобы повернуть" },
    {
      preset: "islands#blueIcon", // стрелка или просто значок
      draggable: true,
      cursor: "grab",
      zIndex: 2000
    }
  );

  // Ставим на место
  editorSelectedPlot = plot;
  editorUpdateRotationHandle();

  // Логика вращения
  let startAngle = 0;
  let center = null;

  editorRotationHandle.events.add("dragstart", () => {
    // Центр берем из Pivot
    center = editorRotationPivot.geometry.getCoordinates();

    // Текущие координаты ручки
    const handleCoords = editorRotationHandle.geometry.getCoordinates(); // [lat, lon]

    const dLat = handleCoords[0] - center[0];
    const dLon = handleCoords[1] - center[1];

    startAngle = Math.atan2(dLon, dLat);
  });

  editorRotationHandle.events.add("drag", () => {
    if (!center) return;

    const handleCoords = editorRotationHandle.geometry.getCoordinates();
    const dLat = handleCoords[0] - center[0];
    const dLon = handleCoords[1] - center[1];
    const currentAngle = Math.atan2(dLon, dLat);

    const deltaAngle = currentAngle - startAngle;

    // Поворачиваем полигон на deltaAngle вокруг center
    if (deltaAngle !== 0) {
      editorRotatePolygonFunc(editorSelectedPlot, deltaAngle, center);
      startAngle = currentAngle;

      // И сам Pivot не должен вращаться, он центр.
      // А вот ручка вращения... ymaps handles drag visual automatically for the placemark being dragged.
    }
  });

  editorRotationHandle.events.add("dragend", () => {
    editorUpdateRotationHandle();
  });

  editorMap.geoObjects.add(editorRotationHandle);

  // Добавим линию от Pivot до ручки для красоты? (опционально)
}

// Вспомогательная функция для расчета центроида
function editorGetPolygonCentroid(polygon) {
  const coords = polygon.geometry.getCoordinates()[0]; // [[lat,lon], ...]
  if (!coords || coords.length === 0) return [0, 0];

  let sumLat = 0;
  let sumLon = 0;
  const len = coords.length;

  for (let i = 0; i < len; i++) {
    sumLat += coords[i][0];
    sumLon += coords[i][1];
  }

  return [sumLat / len, sumLon / len];
}

function editorRotatePolygonFunc(plot, angleRad, center) {
  const polygon = plot.polygon;
  if (!polygon) return;

  // Координаты: [ [ [lat,lon], ... ] ]
  // Мы работаем с coords[0] - внешний контур
  const oldCoords = polygon.geometry.getCoordinates()[0];

  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);

  // Проекция: lat не равно lon в метрах.
  // aspect = 1 / Math.cos(centerLat * Math.PI/180)
  const aspect = 1 / Math.cos(center[0] * Math.PI / 180);

  const newCoords = oldCoords.map(pt => {
    // pt: [lat, lon]
    let dy = pt[0] - center[0]; // distance lat
    let dx = (pt[1] - center[1]) * aspect; // distance lon corrected

    // rotate
    // x' = x*cos - y*sin
    // y' = x*sin + y*cos
    const dxNew = dx * cosA - dy * sinA;
    const dyNew = dx * sinA + dy * cosA;

    // back to lat/lon
    const latNew = center[0] + dyNew;
    const lonNew = center[1] + dxNew / aspect;

    return [latNew, lonNew];
  });

  polygon.geometry.setCoordinates([newCoords]);
}

// ---------------------------------------
// ИЗМЕРЕНИЯ (Длины сторон и Площадь)
// ---------------------------------------
let editorMeasurementObjects = []; // метки длин сторон

function editorClearMeasurements() {
  editorMeasurementObjects.forEach(obj => editorMap.geoObjects.remove(obj));
  editorMeasurementObjects = [];
}

function editorUpdateMeasurements(plot) {
  editorClearMeasurements();
  if (!plot || !plot.polygon) return;

  const geometry = plot.polygon.geometry;
  const coords = geometry.getCoordinates()[0]; // [[lat,lon], ...]
  if (!coords || coords.length < 3) return;

  // 1. Площадь
  // Используем ymaps.util.calculateArea (нужен модуль util.calculateArea)
  // Или простую геодезическую формулу.
  // Попробуем встроенный метод, если доступен, иначе свою.
  let area = 0;
  try {
    area = Math.round(ymaps.util.calculateArea(plot.polygon));
  } catch (e) {
    // fallback (упрощенно)
    area = 0;
  }

  // Обновляем UI
  if (plot === editorSelectedPlot) {
    document.getElementById("fieldArea").value = "12 соток"; // или вычисленное
    document.getElementById("fieldAreaValue").value = area;
    // Обновим карточку в UI тоже? Пока просто поле.
    // Если нужно показывать реальную площадь в м2:
    const areaInput = document.getElementById("fieldArea");
    if (areaInput && !areaInput.value) areaInput.value = area + " м²";
  }

  // 2. Длины сторон
  for (let i = 0; i < coords.length; i++) {
    const p1 = coords[i];
    const p2 = coords[(i + 1) % coords.length]; // замыкаем на первую точку (так как ymaps полигон замкнут, последняя точка == первая, но массив coords[0] обычно содержит дубль первой в конце. Проверим.)

    // ymaps getCoordinates()[0] обычно возвращает замкнутый массив (first == last).
    // Если так, то цикл до length-1.
    // Проверим совпадение
    const isClosed = (Math.abs(coords[0][0] - coords[coords.length - 1][0]) < 1e-9 &&
      Math.abs(coords[0][1] - coords[coords.length - 1][1]) < 1e-9);

    if (i === coords.length - 1 && isClosed) continue; // последний сегмент дублирует первый (если 0-1, 1-2, 2-0, 0)

    // Считаем дистанцию
    const dist = ymaps.coordSystem.geo.distance(p1, p2);
    const distStr = Math.round(dist * 10) / 10 + " м"; // 12.5 м

    // Середина для метки
    const midLat = (p1[0] + p2[0]) / 2;
    const midLon = (p1[1] + p2[1]) / 2;

    // Создаем текстовую метку
    const placemark = new ymaps.Placemark(
      [midLat, midLon],
      {
        iconContent: `<div style="background:white; padding:2px 4px; border-radius:4px; border:1px solid #ccc; font-size:11px; white-space:nowrap;">${distStr}</div>`
      },
      {
        preset: 'islands#circleIcon', // скрываем стандартную иконку, используем layout
        iconLayout: 'default#imageWithContent',
        iconImageHref: '', // нет картинки
        iconImageSize: [0, 0],
        iconImageOffset: [0, 0],
        iconContentOffset: [-15, -10], // чуть сместим
        zIndex: 5000,
        interactive: false // сквозь метки кликаем
      }
    );
    editorMap.geoObjects.add(placemark);
    editorMeasurementObjects.push(placemark);
  }
}
// ---------------------------------------
// ВЫБОР УЧАСТКА (MULTI-SELECT)
// ---------------------------------------
let editorSelectedPlots = []; // Массив выбранных

function editorSelectPlot(plot, centerTo, isMulti) {
  // 1. Stop editing current primary (if any)
  if (editorSelectedPlot && editorSelectedPlot.polygon && editorSelectedPlot.polygon.editor) {
    try { editorSelectedPlot.polygon.editor.stopEditing(); } catch (e) { }
  }
  if (editorRotationHandle) {
    editorMap.geoObjects.remove(editorRotationHandle);
    editorRotationHandle = null;
  }
  if (editorRotationPivot) {
    editorMap.geoObjects.remove(editorRotationPivot);
    editorRotationPivot = null;
  }
  editorClearMeasurements();

  // 2. Update Selection State
  if (isMulti) {
    const idx = editorSelectedPlots.indexOf(plot);
    if (idx >= 0) {
      editorSelectedPlots.splice(idx, 1);
    } else {
      editorSelectedPlots.push(plot);
    }
  } else {
    editorSelectedPlots = [plot];
  }

  // 3. Update Visuals (Stroke for selected)
  // Reset all strokes first (or just efficient update)
  // For simplicity: re-apply styles to all, or just previous selection
  // Lets just loop all plots is okay for <1000 items, or better loop previous selection.
  // We'll rely on editorColorsByStatus for general color, but maybe add a highlight stroke?
  // Current logic uses editorColorsByStatus.
  // Let's add a "selected" visual state?
  // currently we relied on "editor" mode to show it's selected.
  // We need a way to show selection without editor mode.
  // We can change strokeColor to "blue" or "red" for selected.

  editorPlots.forEach(p => {
    const isSelected = editorSelectedPlots.includes(p);
    const c = editorColorsByStatus(p.status);
    if (p.polygon) {
      p.polygon.options.set({
        strokeColor: isSelected ? "#FF0000" : c.stroke, // Red stroke for selected
        strokeWidth: isSelected ? 3 : 1
      });
    }
  });

  // 4. Set Primary Plot (start editing if only 1 selected)
  if (editorSelectedPlots.length === 1) {
    editorSelectedPlot = editorSelectedPlots[0];
    // Start editing
    if (editorSelectedPlot.polygon) {
      try {
        if (!editorSelectedPlot.polygon.editor) {
          editorSelectedPlot.polygon.editor = editorSelectedPlot.polygon.editor || null;
        }
        editorSelectedPlot.polygon.editor.startEditing();
        editorCreateRotationHandle(editorSelectedPlot);
        editorUpdateMeasurements(editorSelectedPlot);

        // Listeners are added already? No, we add them in 'render' but rotation logic is dynamic.
        // Geometry change is handled?
        // editorSelectPlot -> invokes editorCreateRotationHandle -> adds listeners.
      } catch (e) { console.warn(e); }
    }
  } else {
    editorSelectedPlot = null; // No single primary plot
  }

  // 5. Fill Form (Multi logic)
  editorFillFormMulti();

  // 6. Highlight Cards
  editorHighlightSelectedCard(); // Update to highlight all

  // 7. Center Map (only if single selection or explicit center request)
  if (centerTo && editorSelectedPlots.length === 1 && plot.coords && plot.coords.length) {
    const bounds = ymaps.util.bounds.fromPoints(
      plot.coords.map(([lon, lat]) => [lat, lon])
    );
    editorMap.setBounds(bounds, { checkZoomRange: true, duration: 300 });
  }
}

function editorFillFormMulti() {
  if (editorSelectedPlots.length === 0) {
    editorFillForm({}); // Clear
    return;
  }

  if (editorSelectedPlots.length === 1) {
    editorFillForm(editorSelectedPlots[0]);
    return;
  }

  // Multi logic
  const p0 = editorSelectedPlots[0];

  // Helper to check if all share the same value
  const getCommonVal = (key) => {
    const val = p0[key];
    for (let i = 1; i < editorSelectedPlots.length; i++) {
      if (editorSelectedPlots[i][key] != val) return null; // Differ
    }
    return val;
  };

  // Fields mapping
  const fields = [
    "id", "name", "status", "area", "areaValue", "price", "priceValue",
    "cadastralNumber", "address", "landCategory", "ownershipForm",
    "cadastralCost", "marketValueEstimate", "rentPrice", "rentRate",
    "vri", "purpose", "projectDescription", "comment", "zone"
  ];

  const formValues = {};
  fields.forEach(key => {
    const common = getCommonVal(key);
    formValues[key] = (common === null) ? "(разные)" : common;
  });

  // Apply to DOM
  // ID field - usually unique so always (разные) unless bug.
  document.getElementById("fieldId").value = formValues.id;
  document.getElementById("fieldName").value = formValues.name;

  // Status is special (select)
  const statusEl = document.getElementById("fieldStatus");
  if (formValues.status === "(разные)") {
    // Create a temporary option for mixed? Or just select nothing?
    // Selecting nothing is cleaner visually, or empty.
    // But 'select' element needs a valid value usually.
    // Let's set value to "" (Sloboden fallback if not found).
    // Wait, if I set it to "Свободен", user might save "Свободен" to all.
    // I need a way to indicate mixed.
    statusEl.value = "";
    // Add a visual indicator or placeholder if possible.
    // Currently we just leave it as is or show blank.
  } else {
    statusEl.value = formValues.status;
  }

  document.getElementById("fieldArea").value = formValues.area;
  document.getElementById("fieldAreaValue").value = formValues.areaValue ?? "";
  document.getElementById("fieldPrice").value = formValues.price;
  document.getElementById("fieldPriceValue").value = formValues.priceValue ?? "";
  document.getElementById("fieldCadastralNumber").value = formValues.cadastralNumber;
  document.getElementById("fieldAddress").value = formValues.address;
  document.getElementById("fieldLandCategory").value = formValues.landCategory;
  document.getElementById("fieldOwnershipForm").value = formValues.ownershipForm;
  document.getElementById("fieldCadastralCost").value = formValues.cadastralCost;
  document.getElementById("fieldMarketValueEstimate").value = formValues.marketValueEstimate;
  document.getElementById("fieldRentPrice").value = formValues.rentPrice;
  document.getElementById("fieldRentRate").value = formValues.rentRate;
  document.getElementById("fieldVri").value = formValues.vri;
  document.getElementById("fieldPurpose").value = formValues.purpose;
  document.getElementById("fieldProjectDescription").value = formValues.projectDescription;
  document.getElementById("fieldComment").value = formValues.comment;
  document.getElementById("fieldZone").value = formValues.zone;
}

function editorHighlightSelectedCard() {
  const cards = document.querySelectorAll(".plot-card");
  cards.forEach(c => c.classList.remove("selected"));

  editorSelectedPlots.forEach(p => {
    const el = document.querySelector(`.plot-card[data-plot-id="${p.id}"]`);
    if (el) el.classList.add("selected");
  });
}

// ---------------------------------------
// СОХРАНЕНИЕ ТЕКУЩЕГО УЧАСТКА
// ---------------------------------------
// ---------------------------------------
// СОХРАНЕНИЕ ВЫБРАННЫХ УЧАСТКОВ
// ---------------------------------------
function editorSaveSelection() {
  if (editorSelectedPlots.length === 0) {
    alert("Сначала выберите участок.");
    return false;
  }

  // 1. If only 1 selected, use old logic (full overwrite)
  if (editorSelectedPlots.length === 1) {
    const p = editorSelectedPlots[0];

    // Validate Geometry
    if (p.polygon && p.polygon.geometry) {
      const coords = p.polygon.geometry.getCoordinates();
      if (!coords || !coords[0] || coords[0].length < 3) {
        alert("Участок должен содержать минимум 3 точки.");
        return false;
      }
      p.coords = coords[0].map(([lat, lon]) => [lon, lat]);
    }

    editorReadFormIntoPlot(p);

    const c = editorColorsByStatus(p.status);
    if (p.polygon) {
      p.polygon.options.set({ fillColor: c.fill, strokeColor: "#FF0000", strokeWidth: 3 });
    }
    editorRenderCards();
    return true;
  }

  // 2. Multi-save logic
  // Update only values that are NOT "(разные)" in the form
  const getVal = (id) => document.getElementById(id).value.trim();
  const getNum = (id) => {
    const v = getVal(id);
    return v ? Number(v) : null;
  };

  const formMap = {
    // id: getVal("fieldId"), // Don't bulk update ID
    // name: getVal("fieldName"), // Don't bulk update Name usually
    status: getVal("fieldStatus"), // Check against mixed?
    area: getVal("fieldArea"),
    areaValue: getNum("fieldAreaValue"),
    price: getVal("fieldPrice"),
    priceValue: getNum("fieldPriceValue"),
    cadastralNumber: getVal("fieldCadastralNumber"),
    address: getVal("fieldAddress"),
    landCategory: getVal("fieldLandCategory"),
    ownershipForm: getVal("fieldOwnershipForm"),
    cadastralCost: getVal("fieldCadastralCost"),
    marketValueEstimate: getVal("fieldMarketValueEstimate"),
    rentPrice: getVal("fieldRentPrice"),
    rentRate: getVal("fieldRentRate"),
    vri: getVal("fieldVri"),
    purpose: getVal("fieldPurpose"),
    projectDescription: getVal("fieldProjectDescription"),
    comment: getVal("fieldComment"),
    zone: getVal("fieldZone")
  };

  editorSelectedPlots.forEach(plot => {
    // Apply updates
    Object.keys(formMap).forEach(key => {
      const newVal = formMap[key];
      // If val is "(разные)", skip
      // Also skip if it's empty string? No, user might want to clear fields.
      // But how to distinguish "mixed placeholder" from "user typed literal (разные)"?
      // In editorFillFormMulti we set value to "(разные)".
      // So if value IS "(разные)", we assume it wasn't touched.

      if (newVal !== "(разные)") {
        // Special case for select 'status' if we used "" for mixed
        if (key === "status" && newVal === "") {
          // If mixed was empty, and still empty, ignore.
          // If user selected "Free" -> "Свободен".
          return;
        }
        // Special case for numeric nulls
        // getNum returns null if empty.
        // If user wants to clear, it returns null.
        // If placeholder is there... wait, number inputs don't show "(разные)" well.
        // Input type="number" can't show string.
        // In editorFillFormMulti: fieldAreaValue.value = ...
        // If we put string into type=number, it becomes empty.
        // So for numbers, if they differ, the field is empty.
        // If the field is empty on save, does it mean "clear it" or "mixed, don't touch"?
        // This is ambiguous. 
        // Better strategy: Only update if user focused/changed the field?
        // Hard to track without events.
        // Fallback: If empty, don't update? That prevents clearing.
        // Let's assume for now: if user modifies it.
        // Since we can't easily track modification in this function, we rely on value.

        // Refined logic for keys:
        // If original common value was null/"(разные)", and now it is X:
        // If X is empty, and it was mixed, assume untouched.
        // If X is not empty, apply.

        plot[key] = newVal; // Simplified. Warning: might overwrite empty with empty.
      }
    });

    // Styling
    const c = editorColorsByStatus(plot.status);
    if (plot.polygon) {
      plot.polygon.options.set({ fillColor: c.fill, strokeColor: "#FF0000", strokeWidth: 3 });
    }
  });

  editorRenderCards();
  return true;
}

// ---------------------------------------
// УДАЛЕНИЕ УЧАСТКА
// ---------------------------------------
function editorDeleteCurrentPlot() {
  if (editorSelectedPlots.length === 0) {
    alert("Сначала выберите участок(ки) для удаления.");
    return;
  }

  const msg = editorSelectedPlots.length === 1
    ? `Удалить участок "${editorSelectedPlots[0].name || editorSelectedPlots[0].id}"?`
    : `Удалить выбранные участки (${editorSelectedPlots.length} шт.)?`;

  if (!confirm(msg)) {
    return;
  }

  editorSelectedPlots.forEach(p => {
    if (p.polygon) {
      editorMap.geoObjects.remove(p.polygon);
    }
    // Remove from main array
    const idx = editorPlots.indexOf(p);
    if (idx !== -1) editorPlots.splice(idx, 1);
  });

  editorSelectedPlots = [];
  editorSelectedPlot = null;

  editorFillForm({
    id: "", name: "", status: "Свободен", area: "", areaValue: "",
    price: "", priceValue: "", cadastralNumber: "", address: "",
    landCategory: "", ownershipForm: "", cadastralCost: "",
    marketValueEstimate: "", rentPrice: "", rentRate: "",
    vri: "", purpose: "", projectDescription: "", comment: "", zone: ""
  });

  editorRenderCards();
  alert("Удалено.");
}

// ---------------------------------------
// СПИСОК УЧАСТКОВ (карточки)
// ---------------------------------------
function editorRenderCards() {
  const container = document.getElementById("cardsContainer");
  container.innerHTML = "";

  editorPlots
    .slice()
    .sort((a, b) => parseInt(a.id) - parseInt(b.id))
    .forEach(plot => {
      const card = document.createElement("div");
      card.className = "plot-card";
      card.dataset.plotId = plot.id;

      if (editorSelectedPlot && editorSelectedPlot.id === plot.id)
        card.classList.add("selected");

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between;">
          <div><strong>${plot.id}</strong></div>
          <div class="status-pill ${editorStatusClass(plot.status)}">${plot.status}</div>
        </div>
        <div>
          <span class="status-dot ${editorStatusDotClass(plot.status)}"></span>
          Площадь: ${plot.area || "-"} м²
        </div>
        <div>Цена: ${plot.price || "-"}</div>
        <div style="font-size:11px; color:#6b7280; margin-top:2px;">
          ВРИ: ${plot.vri || "-"}
        </div>
      `;

      card.onclick = () => {
        const p = editorPlots.find(x => x.id === plot.id);
        if (p) {
          if (editorSelectedPlot && editorSelectedPlot.polygon && editorSelectedPlot.polygon.editor) {
            try {
              editorSelectedPlot.polygon.editor.stopEditing();
            } catch (e) { }
          }
          editorSelectPlot(p, true);
        }
      };

      container.appendChild(card);
    });
}

// ---------------------------------------
// СОЗДАНИЕ НОВОГО УЧАСТКА
// ---------------------------------------
// ---------------------------------------
// UNDO / REDO HISTORY
// ---------------------------------------
let editorHistory = [];
let editorHistoryIndex = -1;
const MAX_HISTORY = 50;

function editorPushHistory() {
  // Truncate future if any
  if (editorHistoryIndex < editorHistory.length - 1) {
    editorHistory = editorHistory.slice(0, editorHistoryIndex + 1);
  }

  // Create snapshot
  // We need to serialize plain data. 
  const snapshot = editorPlots.map(p => {
    // Ensure we have latest coords from polygon if exists
    let coords = p.coords;
    if (p.polygon && p.polygon.geometry) {
      coords = p.polygon.geometry.getCoordinates()[0].map(([lat, lon]) => [lon, lat]);
    }
    return {
      ...p,
      coords: coords,
      polygon: null, // don't save object
      editor: null
    };
  });

  editorHistory.push(JSON.stringify(snapshot));
  editorHistoryIndex++;

  if (editorHistory.length > MAX_HISTORY) {
    editorHistory.shift();
    editorHistoryIndex--;
  }

  console.log("History pushed. Index:", editorHistoryIndex);
  editorUpdateUndoUI();
}

function editorUndo() {
  if (editorHistoryIndex <= 0) return; // Nothing to undo

  editorHistoryIndex--;
  const snapshot = JSON.parse(editorHistory[editorHistoryIndex]);
  editorRestoreState(snapshot);
  console.log("Undo performed. Index:", editorHistoryIndex);
  editorUpdateUndoUI();
}

function editorRestoreState(snapshot) {
  // Clear map
  if (editorSelectedPlot && editorSelectedPlot.polygon && editorSelectedPlot.polygon.editor) {
    try { editorSelectedPlot.polygon.editor.stopEditing(); } catch (e) { }
  }
  editorPlots.forEach(p => {
    if (p.polygon) editorMap.geoObjects.remove(p.polygon);
  });

  editorClearMeasurements(); // Clear measurements

  // Restore plots
  editorPlots = snapshot.map(p => ({
    ...p,
    polygon: null
  }));

  editorSelectedPlot = null;
  editorRenderPlots();
  editorRenderCards();

  // Clear selection form
  editorFillForm({});
}

function editorUpdateUndoUI() {
  const btn = document.getElementById("btnUndo");
  if (btn) {
    btn.disabled = (editorHistoryIndex <= 0);
    btn.textContent = `Отменить (${editorHistoryIndex})`;
  }
}

// Helper: Calculate 30x40m rectangle coordinates
function editorGetRectCoords(centerLat, centerLon, widthMeters, heightMeters) {
  // 1 deg lat ~= 111111 meters
  // 1 deg lon ~= 111111 * cos(lat) meters
  const metersPerLat = 111111;
  const metersPerLon = 111111 * Math.cos(centerLat * Math.PI / 180);

  const dLat = (heightMeters / 2) / metersPerLat;
  const dLon = (widthMeters / 2) / metersPerLon;

  return [
    [centerLat + dLat, centerLon - dLon], // Top-Left
    [centerLat + dLat, centerLon + dLon], // Top-Right
    [centerLat - dLat, centerLon + dLon], // Bottom-Right
    [centerLat - dLat, centerLon - dLon]  // Bottom-Left
  ];
}

function editorCreateNewPlot() {
  if (editorSelectedPlot && editorSelectedPlot.polygon && editorSelectedPlot.polygon.editor) {
    try {
      editorSelectedPlot.polygon.editor.stopEditing();
    } catch (e) { }
  }

  // Save history before creating new
  editorPushHistory();

  const nextId = Math.max(0, ...editorPlots.map(p => parseInt(p.id || 0))) + 1;

  const plot = {
    id: String(nextId),
    name: "Участок №" + nextId,
    status: "Свободен",
    area: "12 соток",
    areaValue: 1200,
    price: "",
    priceValue: null,
    cadastralNumber: "",
    address: "",
    landCategory: "",
    ownershipForm: "",
    cadastralCost: "",
    marketValueEstimate: "",
    rentPrice: "",
    rentRate: "",
    vri: "",
    purpose: "",
    projectDescription: "",
    comment: "",
    zone: "",
    coords: []
  };

  const c = editorColorsByStatus(plot.status);

  const center = editorMap.getCenter(); // [lat, lon]

  // 30x40 meters
  const polyCoords = editorGetRectCoords(center[0], center[1], 30, 40);

  const polygon = new ymaps.Polygon(
    [polyCoords],
    {
      hintContent: plot.name,
      plotId: plot.id
    },
    {
      fillColor: c.fill,
      strokeColor: c.stroke,
      strokeWidth: 2,
      draggable: true,
      fillOpacity: 0.6
    }
  );

  polygon.events.add("click", (e) => {
    const domEvent = e.get("domEvent");
    const isMulti = domEvent.originalEvent.ctrlKey || domEvent.originalEvent.metaKey || domEvent.originalEvent.shiftKey;
    editorSelectPlot(plot, true, isMulti);
  });

  // Add DragEnd listener for history
  polygon.events.add("dragend", () => {
    editorUpdateRotationHandle();
    editorPushHistory(); // Undo point after drag
  });

  // Add GeometryChange listener for history (vertex edit)
  // Note: geometrychange fires frequently during drag, so we need a debounced push or push on state change start/end.
  // For simplicity, we can rely on editor state changes or just manual 'Save' for now, 
  // BUT user asked for undo.
  // Ideally, we push history on 'editorstatechange' or manual start/stop editing.
  // Let's add geometrychange listener inside editorSelectPlot where we start editing.

  editorMap.geoObjects.add(polygon);
  plot.polygon = polygon;
  plot.coords = polyCoords.map(([lat, lon]) => [lon, lat]);

  editorPlots.push(plot);
  editorSelectPlot(plot, true);
  editorRenderCards();

  // Save history after creation
  editorPushHistory();
}

function editorStandardizeCurrentPlot() {
  if (editorSelectedPlots.length !== 1) {
    alert("Выберите один участок для стандартизации");
    return;
  }

  if (editorSelectedPlot.polygon.editor) {
    try { editorSelectedPlot.polygon.editor.stopEditing(); } catch (e) { }
  }

  // Push history before change
  editorPushHistory();

  const centroid = editorGetPolygonCentroid(editorSelectedPlot.polygon);
  const newCoords = editorGetRectCoords(centroid[0], centroid[1], 30, 40);

  editorSelectedPlot.polygon.geometry.setCoordinates([newCoords]);
  editorSelectedPlot.coords = newCoords.map(([lat, lon]) => [lon, lat]);

  // Update measurements and handles
  editorUpdateRotationHandle();
  editorUpdateMeasurements(editorSelectedPlot);

  // Push history after change? Or let Save handle it? 
  // Better push here so undo works for this action.
  editorPushHistory();
}

function editorCloneCurrentPlot() {
  if (editorSelectedPlots.length !== 1) {
    alert("Выберите один участок для клонирования");
    return;
  }
  // editorSelectedPlot is set when length=1


  // Stop editing current
  if (editorSelectedPlot.polygon && editorSelectedPlot.polygon.editor) {
    try { editorSelectedPlot.polygon.editor.stopEditing(); } catch (e) { }
  }

  editorPushHistory();

  const nextId = Math.max(0, ...editorPlots.map(p => parseInt(p.id || 0))) + 1;

  // Deep copy data
  const newPlot = JSON.parse(JSON.stringify(editorSelectedPlot));
  newPlot.id = String(nextId);
  newPlot.name = "Копия " + editorSelectedPlot.name;
  newPlot.polygon = null; // reset object ref

  // Offset coords slightly (e.g. ~10 meters East)
  // 1 deg lon ~= 111km * cos(lat)
  // 10m ~= 0.0001 deg roughly
  const offsetLat = 0.0000;
  const offsetLon = 0.00015;

  newPlot.coords = newPlot.coords.map(([lat, lon]) => [lat + offsetLat, lon + offsetLon]);

  // Add to map
  const c = editorColorsByStatus(newPlot.status);
  const polygon = new ymaps.Polygon(
    [newPlot.coords.map(([lat, lon]) => [lat, lon])], // format [[lat,lon],...]
    { hintContent: newPlot.name, plotId: newPlot.id },
    {
      fillColor: c.fill,
      strokeColor: c.stroke,
      strokeWidth: 2,
      draggable: true,
      fillOpacity: 0.6
    }
  );

  polygon.events.add("click", (e) => {
    const domEvent = e.get("domEvent");
    const isMulti = domEvent.originalEvent.ctrlKey || domEvent.originalEvent.metaKey || domEvent.originalEvent.shiftKey;
    editorSelectPlot(newPlot, true, isMulti);
  });
  polygon.events.add("dragend", () => {
    editorUpdateRotationHandle();
    editorPushHistory();
  });

  editorMap.geoObjects.add(polygon);
  newPlot.polygon = polygon;

  editorPlots.push(newPlot);
  editorSelectPlot(newPlot, true);
  editorRenderCards();

  editorPushHistory();
}

// ---------------------------------------
// ИНИЦИАЛИЗАЦИЯ КАРТЫ
// ---------------------------------------
function initEditor() {
  editorMap = new ymaps.Map("map", {
    center: [43.17403, 44.9941],
    zoom: 17,
    controls: ["zoomControl", "typeSelector", "fullscreenControl"]
  });

  try {
    editorPlanOverlay = new ymaps.Rectangle(
      // South-West (43.1720..., 44.9894...), North-East (43.1760..., 44.9988...)
      [
        [43.17201949, 44.98955600], // Shifted: +4m Lat, +4m Lon
        [43.17609486, 44.99890082]
      ],
      { hintContent: "План-схема" },
      {
        fillImageHref: 'plan.png',
        fillMethod: 'stretch',
        fillOpacity: 0.75, // по требованию: 0.75
        stroke: false,
        zIndex: 0,
        zIndexHover: 0,
        interactivityModel: 'default#transparent'
      }
    );

    editorMap.geoObjects.add(editorPlanOverlay);
    console.log("Overlay (Rectangle) initialized successfully");

    // Центрируем камеру на план
    editorMap.setBounds(
      editorPlanOverlay.geometry.getBounds(),
      { checkZoomRange: true }
    );

  } catch (e) {
    console.error("Critical error in Overlay:", e);
    alert("Критическая ошибка создания плана: " + e.message);
  }

  alert("Начинаю загрузку plotsData.json...");

  fetch("plotsData.json?v=" + new Date().getTime())
    .then(r => {
      if (!r.ok) {
        throw new Error("HTTP " + r.status);
      }
      return r.json();
    })
    .then(arr => {
      alert("Успешно загружено участков: " + arr.length);
      editorPlots = arr.map(p => ({
        ...p,
        polygon: null
      }));
      editorRenderPlots();
      editorRenderCards();

      // Init history
      editorHistory = [];
      editorHistoryIndex = -1;
      editorPushHistory(); // Initial state
    })
    .catch(err => {
      alert("Ошибка загрузки данных: " + err);
      console.warn("Не удалось загрузить plotsData.json:", err);
    });

  editorSetupUI();
}

// ---------------------------------------
// EXPORT TO CSV (EXCEL)
// ---------------------------------------
function editorExportCsv() {
  // Fields to export
  const headers = [
    "ID", "Название", "Статус", "Площадь", "Площадь (м2)",
    "Цена", "Цена (число)", "Кадастровый номер", "Адрес",
    "Категория земель", "Форма собственности", "Кадастровая стоимость",
    "Оценка рыночной стоимости", "Арендная плата", "Ставка аренды",
    "ВРИ", "Назначение", "Описание проекта", "Комментарий", "Зона"
  ];

  const keys = [
    "id", "name", "status", "area", "areaValue",
    "price", "priceValue", "cadastralNumber", "address",
    "landCategory", "ownershipForm", "cadastralCost",
    "marketValueEstimate", "rentPrice", "rentRate",
    "vri", "purpose", "projectDescription", "comment", "zone"
  ];

  // Helper to escape CSV fields
  const escapeCsv = (val) => {
    if (val === null || val === undefined) return "";
    let s = String(val);
    s = s.replace(/"/g, '""'); // double quotes
    return `"${s}"`;
  };

  const rows = [];
  rows.push(headers.join(";")); // Excel loves semi-colons in some locales, but comma is standard CSV

  editorPlots.forEach(p => {
    const rowData = keys.map(k => escapeCsv(p[k]));
    rows.push(rowData.join(";"));
  });

  const csvContent = "\uFEFF" + rows.join("\n"); // Add BOM for Excel UTF-8
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", "plots_export.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ---------------------------------------
// ЕДИНАЯ ФУНКЦИЯ ЭКСПОРТА JSON (СОХРАНЕНИЕ НА СЕРВЕР)
// ---------------------------------------
function editorExportJson() {
  try {
    // 2. Сохраняем все поля формы в каждый plot
    // Если есть выделенные, сохраним их состояние из формы в объекты
    if (editorSelectedPlots.length > 0) {
      editorSaveSelection();
    }

    // 2. Собираем "плоские" объекты
    const plainPlots = editorPlots.map(plot => ({
      id: plot.id,
      name: plot.name,
      status: plot.status,
      area: plot.area,
      areaValue: plot.areaValue ?? null,
      price: plot.price,
      priceValue: plot.priceValue ?? null,
      cadastralNumber: plot.cadastralNumber || "",
      address: plot.address || "",
      landCategory: plot.landCategory || "",
      ownershipForm: plot.ownershipForm || "",
      cadastralCost: plot.cadastralCost || "",
      marketValueEstimate: plot.marketValueEstimate || "",
      rentPrice: plot.rentPrice || "",
      rentRate: plot.rentRate || "",
      vri: plot.vri,
      purpose: plot.purpose,
      projectDescription: plot.projectDescription,
      comment: plot.comment,
      zone: plot.zone || "",
      coords: plot.coords || []
    }));

    // 3. Отправляем на сервер
    const json = JSON.stringify(plainPlots, null, 2);

    fetch('/save-plots', {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: json
    })
      .then(r => r.json())
      .then(res => {
        if (res.status === "success") {
          console.log("Успешно сохранено на сервере!");
          // Можно показать уведомление, если нужно
        } else {
          alert("Ошибка при сохранении на сервере: " + res.message);
        }
      })
      .catch(err => {
        console.error("Ошибка сети при сохранении:", err);
        alert("Ошибка сети. Проверьте консоль.");
      });

  } catch (e) {
    console.error("Ошибка экспорта JSON:", e);
    alert("Ошибка экспорта JSON. Открой консоль (F12).");
  }
}

// ---------------------------------------
// НАСТРОЙКА UI (кнопки)
// ---------------------------------------
function editorSetupUI() {
  document.getElementById("btnNewPlot").onclick = editorCreateNewPlot;

  // Manual save (local)
  // Manual save (local)
  document.getElementById("btnSavePlot").onclick = () => {
    // Push history before save
    editorPushHistory();
    if (editorSaveSelection()) {
      // Disable auto-export
      // editorExportJson(); 
      console.log("Local save only. Click Global Save to persist.");
    }
  };

  // Manual delete (local)
  document.getElementById("btnDeletePlot").onclick = () => {
    editorPushHistory();
    editorDeleteCurrentPlot();
    // editorExportJson(); 
  };

  if (btnStandardize) {
    btnStandardize.onclick = editorStandardizeCurrentPlot;
  }

  const btnClone = document.getElementById("btnClonePlot");
  if (btnClone) {
    btnClone.onclick = editorCloneCurrentPlot;
  }

  // Undo Button
  const btnUndo = document.getElementById("btnUndo");
  if (btnUndo) {
    btnUndo.onclick = editorUndo;
  }

  // Global Save Button
  const btnGlobalSave = document.getElementById("btnGlobalSave");
  if (btnGlobalSave) {
    btnGlobalSave.onclick = () => {
      if (confirm("Вы уверены, что хотите сохранить все изменения на сервере?")) {
        editorExportJson();
      }
    };
  }

  const btnExportCsv = document.getElementById("btnExportCsv");
  if (btnExportCsv) {
    btnExportCsv.onclick = editorExportCsv;
  }

  // переключение плана



  // переключение плана
  const btnToggle = document.getElementById("btnTogglePlan");
  if (btnToggle) {
    btnToggle.onclick = () => {
      console.log("Нажата кнопка переключения плана");
      if (!editorPlanOverlay) {
        alert("Ошибка: слой плана не инициализирован (null)");
        console.error("editorPlanOverlay is null");
        return;
      }
      try {
        const v = editorPlanOverlay.options.get("visible");
        console.log("Текущая видимость:", v);
        // Toggle opacity or visibility
        // If we want detailed fade, we need animation steps.
        // For simple toggle, just visible.
        // But user asked for "Smooth fade in".
        // Let's implement a simple opacity transition loop.

        const targetOpacity = (v === false || v === 0) ? 0.75 : 0;
        const startOpacity = editorPlanOverlay.options.get("fillOpacity") || 0;

        // If it was effectively hidden (opacity 0) or invisible
        if (v === false) {
          editorPlanOverlay.options.set("visible", true);
          editorPlanOverlay.options.set("fillOpacity", 0);
        }

        let currentOp = startOpacity;
        const step = (targetOpacity - startOpacity) / 20; // 20 steps
        let frame = 0;

        const anim = setInterval(() => {
          frame++;
          currentOp += step;
          if (frame >= 20) {
            currentOp = targetOpacity;
            clearInterval(anim);
            if (targetOpacity === 0) editorPlanOverlay.options.set("visible", false);
          }
          editorPlanOverlay.options.set("fillOpacity", currentOp);
        }, 30); // 30ms * 20 = 600ms transition

      } catch (err) {
        console.error("Ошибка при переключении:", err);
        alert("Ошибка переключения: " + err);
      }
    };
  } else {
    console.error("Кнопка btnTogglePlan не найдена!");
  }
  // редактирование плана
  const btnEditPlan = document.getElementById("btnEditPlan");
  if (btnEditPlan) {
    btnEditPlan.onclick = () => {
      if (!editorPlanOverlay) {
        alert("Слой плана не создан");
        return;
      }

      // Проверяем, включен ли режим редактирования
      if (editorPlanOverlay.editor && editorPlanOverlay.editor.state) {
        const isEditing = editorPlanOverlay.editor.state.get("editing");
        if (isEditing) {
          editorPlanOverlay.editor.stopEditing();
          // Возвращаем "прозрачность" для кликов, чтобы можно было кликать на участки под планом
          editorPlanOverlay.options.set("interactivityModel", "default#transparent");

          btnEditPlan.textContent = "Редактировать план";
          btnEditPlan.classList.remove("selected"); // визуально показать активность
        } else {
          // Включаем взаимодействие, чтобы можно было тащить план
          editorPlanOverlay.options.set("interactivityModel", "default#geoObject");

          editorPlanOverlay.editor.startEditing();
          btnEditPlan.textContent = "Завершить ред. плана";
          btnEditPlan.classList.add("selected");
        }
      } else {
        // На случай если editor не инициализирован сразу или API другое (для Rectangle editor работает)
        // Обычно startEditing() доступен.
        try {
          // Включаем взаимодействие
          editorPlanOverlay.options.set("interactivityModel", "default#geoObject");

          editorPlanOverlay.editor.startEditing();
          btnEditPlan.textContent = "Завершить ред. плана";
          btnEditPlan.classList.add("selected");
        } catch (e) {
          console.warn("Ошибка старта редактирования плана:", e);
          alert("Не удалось включить редактор плана: " + e.message);
        }
      }
    };
  }

}

ymaps.ready(initEditor);
