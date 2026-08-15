
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const photo = $("wallPhoto");
  const overlay = $("photoOverlay");
  const overlayCtx = overlay.getContext("2d");
  let drawing = $("drawingCanvas");
  let drawingCtx = drawing.getContext("2d");

  const state = {
    id: crypto.randomUUID(),
    mode: "move",
    points: [],
    manualWidthPoints: [],
    manualHeightPoints: [],
    sockets: [],
    notches: [],
    shoulderNotchesEnabled: false,
    offSquareHeightSections: [],
    offSquareSquareCorner: null,
    squareCornerIndex: null,
    cornerRadii: {},
    measurementDirection: "ltr",
    productionModificationsApplied: false,
    productionSocketSizes: [],
    productionAdjustedMeasurements: { widths: [], heights: [], overallWidth: null, offSquareOverallWidth: null },
    productionMeasurements: {
      overallWidth: null,
      offSquareOverallWidth: null,
      leftHeight: null,
      rightHeight: null,
      extractorHeight: null,
      shoulderNotchDepth: null,
      stations: [],
      heights: []
    },
    cutoutType: "double",
    closed: false,
    draggingPointIndex: -1,
    draggingSocketIndex: -1,
    selectedSocketIndex: -1,
    draggingNotchIndex: -1,
    history: [],
    photoDataUrl: null,
    calibrationPoints: [],
    mmPerPixel: null,
    detectionConfidence: 0,
    detectedOutlinePending: false,
    originalAiPoints: [],
    detectionNotes: "",
    detectionMode: "benchmark",
    updatedAt: new Date().toISOString()
  };

  const cloneGeometry = () => JSON.stringify({
    points: state.points,
    manualWidthPoints: state.manualWidthPoints,
    manualHeightPoints: state.manualHeightPoints,
    sockets: state.sockets,
    notches: state.notches,
    offSquareHeightSections: state.offSquareHeightSections,
    squareCornerIndex: state.squareCornerIndex,
    cornerRadii: state.cornerRadii,
    closed: state.closed,
    calibrationPoints: state.calibrationPoints,
    mmPerPixel: state.mmPerPixel
  });

  const pushHistory = () => {
    state.history.push(cloneGeometry());
    if (state.history.length > 50) state.history.shift();
  };

  const setStatus = (element, message, success = false) => {
    element.textContent = message;
    element.className = `status ${success ? "success" : "warning"}`;
  };

  const setMode = (mode) => {
    state.mode = mode;
    $("addWidthModeButton")?.classList.toggle("active", mode === "add-width");
    $("addHeightModeButton")?.classList.toggle("active", mode === "add-height");
    $("squareCornerModeButton")?.classList.toggle("active", mode === "square-corner");
    $("moveModeButton").classList.toggle("active", mode === "move");
    ["singleSocketModeButton", "socketModeButton", "cookerSwitchModeButton"].forEach((id) => {
      $(id).classList.toggle("active", mode === "socket" && $(id).dataset.cutoutType === state.cutoutType);
    });
    $("notchModeButton").classList.toggle("active", mode === "notch");
    $("holeModeButton")?.classList.toggle("active", mode === "socket" && state.cutoutType === "hole");
    $("radiusModeButton")?.classList.toggle("active", mode === "radius");
    $("eraseModeButton").classList.toggle("active", mode === "erase");
    $("calibrationModeButton").classList.toggle("active", mode === "calibrate");
  };

  // Return the exact on-screen rectangle occupied by the image pixels.
  // The <img> uses object-fit: contain, so its DOM box can be larger than
  // the rendered photograph (letterboxing). The overlay must follow the
  // rendered photograph, not the outer <img> element.
  const renderedPhotoRect = () => {
    const box = photo.getBoundingClientRect();
    if (box.width < 10 || box.height < 10 || !photo.naturalWidth || !photo.naturalHeight) {
      return { left: 0, top: 0, width: box.width, height: box.height };
    }

    const imageAspect = photo.naturalWidth / photo.naturalHeight;
    const boxAspect = box.width / box.height;
    let width;
    let height;

    if (imageAspect > boxAspect) {
      width = box.width;
      height = width / imageAspect;
    } else {
      height = box.height;
      width = height * imageAspect;
    }

    return {
      left: (box.width - width) / 2,
      top: (box.height - height) / 2,
      width,
      height
    };
  };

  const resizeOverlay = () => {
    const rect = renderedPhotoRect();
    if (rect.width < 10 || rect.height < 10) return;

    const ratio = window.devicePixelRatio || 1;
    overlay.width = Math.round(rect.width * ratio);
    overlay.height = Math.round(rect.height * ratio);
    overlay.style.left = `${rect.left}px`;
    overlay.style.top = `${rect.top}px`;
    overlay.style.right = "auto";
    overlay.style.bottom = "auto";
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    overlayCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
    redrawOverlay();
  };

  const localPoint = (event) => {
    const rect = overlay.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  };

  const nearestIndex = (point, collection, radius = 34) => {
    let bestIndex = -1;
    let bestDistance = radius;

    collection.forEach((candidate, index) => {
      const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });

    return bestIndex;
  };


  const nearestPointOnOutline = (point) => {
    if (state.points.length < 2) return { ...point };
    let best = { ...point };
    let bestDistance = Infinity;
    const segmentCount = state.closed ? state.points.length : state.points.length - 1;

    for (let i = 0; i < segmentCount; i += 1) {
      const a = state.points[i];
      const b = state.points[(i + 1) % state.points.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((point.x-a.x)*dx + (point.y-a.y)*dy) / len2));
      const candidate = { x: a.x + t*dx, y: a.y + t*dy };
      const d = Math.hypot(candidate.x-point.x, candidate.y-point.y);
      if (d < bestDistance) {
        bestDistance = d;
        best = candidate;
      }
    }
    return best;
  };

  const nearestOutlineSegment = (point) => {
    if (state.points.length < 2) return null;
    let best = null;
    let bestDistance = Infinity;
    const segmentCount = state.closed ? state.points.length : state.points.length - 1;
    for (let i = 0; i < segmentCount; i += 1) {
      const a = state.points[i];
      const b = state.points[(i + 1) % state.points.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((point.x-a.x)*dx + (point.y-a.y)*dy) / len2));
      const projected = { x: a.x + t*dx, y: a.y + t*dy };
      const distance = Math.hypot(projected.x-point.x, projected.y-point.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { segmentIndex:i, point:projected, distance };
      }
    }
    return best;
  };

  const cutoutSpec = (cutout) => {
    const type = cutout.type || "double";
    const specs = {
      single: { width: 85, height: 85, label: "S/S" },
      switch: { width: 85, height: 85, label: "S/S" },
      double: { width: 145, height: 85, label: "D/S" },
      cooker: { width: 85, height: 145, label: "C/S" },
      // M/S is a variable overall group size. Start from the double fitting
      // footprint and let the surveyor enter the measured group width/height.
      multiple: { width: 145, height: 85, label: "M/S" },
      hole: { width: 20, height: 20, label: "HOLE" },
      custom: { width: 100, height: 75, label: "CUSTOM" }
    };
    const base = { ...(specs[type] || specs.double) };
    if (cutout.orientation === "vertical" && type !== "cooker") [base.width, base.height] = [base.height, base.width];
    return base;
  };

  const redrawOverlay = () => {
    const rect = overlay.getBoundingClientRect();
    overlayCtx.clearRect(0, 0, rect.width, rect.height);

    if (state.points.length) {
      overlayCtx.beginPath();
      overlayCtx.moveTo(state.points[0].x, state.points[0].y);
      state.points.slice(1).forEach((point) => overlayCtx.lineTo(point.x, point.y));

      if (state.closed) {
        overlayCtx.closePath();
        overlayCtx.fillStyle = "rgba(37, 99, 235, .18)";
        overlayCtx.fill();
      }

      overlayCtx.strokeStyle = "#22d3ee";
      overlayCtx.lineWidth = 4;
      overlayCtx.stroke();
    }

    state.points.forEach((point, index) => {
      overlayCtx.beginPath();
      overlayCtx.arc(point.x, point.y, matchMedia('(pointer:coarse)').matches ? 14 : 10, 0, Math.PI * 2);
      overlayCtx.fillStyle = "#fff";
      overlayCtx.fill();
      overlayCtx.strokeStyle = "#2563eb";
      overlayCtx.lineWidth = 4;
      overlayCtx.stroke();

      // Alpha 5.2.9: point numbers deliberately hidden on the photo scan.
      // Blue edit points remain visible and draggable.
    });

    const drawMeasurementMarker=(point,label,colour)=>{
      overlayCtx.save();
      overlayCtx.beginPath();
      overlayCtx.arc(point.x,point.y,9,0,Math.PI*2);
      overlayCtx.fillStyle="#ffffff"; overlayCtx.fill();
      overlayCtx.strokeStyle=colour; overlayCtx.lineWidth=4; overlayCtx.stroke();
      overlayCtx.fillStyle=colour; overlayCtx.font="800 12px -apple-system, sans-serif";
      overlayCtx.textAlign="center"; overlayCtx.fillText(label,point.x,point.y-14);
      overlayCtx.restore();
    };
    (state.manualWidthPoints||[]).forEach(point=>drawMeasurementMarker(point,"W+","#a855f7"));
    (state.manualHeightPoints||[]).forEach(point=>drawMeasurementMarker(point,"H+","#f59e0b"));


    if (state.closed && state.points.length > 1) {
      state.points.forEach((point, index) => {
        const next = state.points[(index + 1) % state.points.length];
        const pixels = Math.hypot(next.x - point.x, next.y - point.y);
        const length = state.mmPerPixel ? pixels * state.mmPerPixel : null;
        if (!length) return;
        const midX = (point.x + next.x) / 2;
        const midY = (point.y + next.y) / 2;
        overlayCtx.save();
        overlayCtx.font = "800 14px -apple-system, sans-serif";
        overlayCtx.textAlign = "center";
        overlayCtx.textBaseline = "middle";
        const text = `${Math.round(length)} mm`;
        const textWidth = overlayCtx.measureText(text).width;
        overlayCtx.fillStyle = "rgba(15, 23, 42, .82)";
        overlayCtx.fillRect(midX - textWidth / 2 - 5, midY - 11, textWidth + 10, 22);
        overlayCtx.fillStyle = "#fff";
        overlayCtx.fillText(text, midX, midY);
        overlayCtx.restore();
      });
    }

    state.sockets.forEach((socket, index) => {
      const spec = cutoutSpec(socket);
      if(socket.type === "hole") {
        const r=11;
        overlayCtx.save(); overlayCtx.strokeStyle="#f87171"; overlayCtx.lineWidth=4;
        overlayCtx.beginPath(); overlayCtx.moveTo(socket.x-r,socket.y); overlayCtx.lineTo(socket.x+r,socket.y);
        overlayCtx.moveTo(socket.x,socket.y-r); overlayCtx.lineTo(socket.x,socket.y+r); overlayCtx.stroke();
        overlayCtx.fillStyle="#fff"; overlayCtx.font="700 13px -apple-system, sans-serif";
        overlayCtx.fillText(`H Ø${Math.round(Number(socket.editDiameter)||20)}`,socket.x+14,socket.y-10); overlayCtx.restore();
        return;
      }
      const markerWidth = Number(socket.detectedWidth) > 0 ? Number(socket.detectedWidth) : spec.width;
      const markerHeight = Number(socket.detectedHeight) > 0 ? Number(socket.detectedHeight) : spec.height;
      overlayCtx.fillStyle = "rgba(239, 68, 68, .18)";
      overlayCtx.strokeStyle = "#f87171";
      overlayCtx.lineWidth = 4;
      overlayCtx.fillRect(socket.x - markerWidth / 2, socket.y - markerHeight / 2, markerWidth, markerHeight);
      overlayCtx.strokeRect(socket.x - markerWidth / 2, socket.y - markerHeight / 2, markerWidth, markerHeight);
      overlayCtx.fillStyle = "#fff"; overlayCtx.font = "700 14px -apple-system, sans-serif"; overlayCtx.textAlign = "center";
      overlayCtx.fillText(`${spec.label} ${index + 1}`, socket.x, socket.y + 5); overlayCtx.textAlign = "start";
    });

    state.notches.forEach((notch, index) => {
      const r = 11;
      overlayCtx.beginPath();
      overlayCtx.moveTo(notch.x, notch.y-r);
      overlayCtx.lineTo(notch.x+r, notch.y);
      overlayCtx.lineTo(notch.x, notch.y+r);
      overlayCtx.lineTo(notch.x-r, notch.y);
      overlayCtx.closePath();
      overlayCtx.fillStyle = "rgba(249, 115, 22, .25)";
      overlayCtx.fill();
      overlayCtx.strokeStyle = "#fb923c";
      overlayCtx.lineWidth = 4;
      overlayCtx.stroke();
      overlayCtx.fillStyle = "#fff";
      overlayCtx.font = "700 14px -apple-system, sans-serif";
      overlayCtx.fillText(`N${index+1}`, notch.x+14, notch.y-10);
    });

    if (state.calibrationPoints.length) {
      state.calibrationPoints.forEach((point, index) => {
        overlayCtx.beginPath();
        overlayCtx.arc(point.x, point.y, 9, 0, Math.PI * 2);
        overlayCtx.fillStyle = "#facc15";
        overlayCtx.fill();
        overlayCtx.strokeStyle = "#713f12";
        overlayCtx.lineWidth = 3;
        overlayCtx.stroke();

        overlayCtx.fillStyle = "#fefce8";
        overlayCtx.font = "700 16px -apple-system, sans-serif";
        overlayCtx.fillText(`C${index + 1}`, point.x + 12, point.y - 10);
      });

      if (state.calibrationPoints.length === 2) {
        const [a, b] = state.calibrationPoints;
        overlayCtx.beginPath();
        overlayCtx.moveTo(a.x, a.y);
        overlayCtx.lineTo(b.x, b.y);
        overlayCtx.strokeStyle = "#facc15";
        overlayCtx.lineWidth = 4;
        overlayCtx.setLineDash([10, 7]);
        overlayCtx.stroke();
        overlayCtx.setLineDash([]);
      }
    }

    if (!state.points.length) {
      setStatus($("photoStatus"), "Tap the first corner.");
    } else {
      const suffix = state.closed ? " · outline closed" : "";
      setStatus(
        $("photoStatus"),
        `${state.points.length} corner point${state.points.length === 1 ? "" : "s"} selected${suffix}`,
        true
      );
    }
  };



  const cleanDetectedPolygon = (normalizedPoints) => {
    const source = Array.isArray(normalizedPoints) ? normalizedPoints : [];
    if (source.length < 3) return source;

    // Remove repeated or almost repeated vertices.
    const deduped = [];
    source.forEach((point) => {
      const p = {
        x: Math.max(0, Math.min(1, Number(point.x))),
        y: Math.max(0, Math.min(1, Number(point.y)))
      };
      const previous = deduped[deduped.length - 1];
      if (!previous || Math.hypot(p.x - previous.x, p.y - previous.y) > 0.012) {
        deduped.push(p);
      }
    });
    if (
      deduped.length > 3 &&
      Math.hypot(
        deduped[0].x - deduped[deduped.length - 1].x,
        deduped[0].y - deduped[deduped.length - 1].y
      ) < 0.012
    ) {
      deduped.pop();
    }

    // Remove almost-collinear middle points.
    let points = deduped.filter((point, index, all) => {
      if (all.length <= 4) return true;
      const a = all[(index - 1 + all.length) % all.length];
      const b = point;
      const c = all[(index + 1) % all.length];
      const cross = Math.abs(
        (b.x - a.x) * (c.y - b.y) -
        (b.y - a.y) * (c.x - b.x)
      );
      return cross > 0.0018;
    });

    // Glass templates are normally orthogonal. Snap only edges already close
    // to horizontal or vertical, so genuine slopes remain untouched.
    const snapTolerance = 0.045;
    for (let pass = 0; pass < 2; pass += 1) {
      const adjusted = points.map((p) => ({ ...p }));
      points.forEach((point, index) => {
        const nextIndex = (index + 1) % points.length;
        const next = points[nextIndex];
        const dx = Math.abs(next.x - point.x);
        const dy = Math.abs(next.y - point.y);
        if (dy < snapTolerance && dx > dy * 2.5) {
          const y = (point.y + next.y) / 2;
          adjusted[index].y = y;
          adjusted[nextIndex].y = y;
        } else if (dx < snapTolerance && dy > dx * 2.5) {
          const x = (point.x + next.x) / 2;
          adjusted[index].x = x;
          adjusted[nextIndex].x = x;
        }
      });
      points = adjusted;
    }

    return points;
  };

  const analyseEdgeBands = () => {
    const rect = overlay.getBoundingClientRect();
    const width = Math.max(320, Math.round(rect.width));
    const height = Math.max(220, Math.round(rect.height));
    const sample = document.createElement("canvas");
    sample.width = width;
    sample.height = height;
    const ctx = sample.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(photo, 0, 0, width, height);
    const data = ctx.getImageData(0, 0, width, height).data;
    const grey = (x, y) => {
      const i = (Math.max(0, Math.min(height - 1, y)) * width + Math.max(0, Math.min(width - 1, x))) * 4;
      return data[i] * .299 + data[i + 1] * .587 + data[i + 2] * .114;
    };
    const verticalScore = (x) => {
      let score = 0;
      for (let y = Math.round(height * .18); y < Math.round(height * .9); y += 3) {
        score += Math.abs(grey(x + 2, y) - grey(x - 2, y));
      }
      return score;
    };
    const horizontalScore = (y) => {
      let score = 0;
      for (let x = Math.round(width * .08); x < Math.round(width * .92); x += 3) {
        score += Math.abs(grey(x, y + 2) - grey(x, y - 2));
      }
      return score;
    };
    const bestIn = (start, end, scorer) => {
      let best = start, bestScore = -1;
      for (let v = start; v <= end; v += 2) {
        const score = scorer(v);
        if (score > bestScore) { best = v; bestScore = score; }
      }
      return { value: best, score: bestScore };
    };
    return {
      left: bestIn(Math.round(width * .04), Math.round(width * .28), verticalScore),
      right: bestIn(Math.round(width * .72), Math.round(width * .96), verticalScore),
      base: bestIn(Math.round(height * .62), Math.round(height * .96), horizontalScore),
      shoulder: bestIn(Math.round(height * .32), Math.round(height * .72), horizontalScore),
      top: bestIn(Math.round(height * .08), Math.round(height * .45), horizontalScore),
      width,
      height
    };
  };

  const suggestLocalFallback = () => {
    if (!photo.complete || !photo.naturalWidth) {
      alert("Load a photo first.");
      return;
    }
    pushHistory();
    const bands = analyseEdgeBands();
    const sx = overlay.getBoundingClientRect().width / bands.width;
    const sy = overlay.getBoundingClientRect().height / bands.height;
    const left = bands.left.value * sx;
    const right = bands.right.value * sx;
    const base = bands.base.value * sy;
    const shoulder = bands.shoulder.value * sy;
    const top = Math.min(bands.top.value * sy, shoulder - 45);
    const centreLeft = left + (right - left) * .43;
    const centreRight = left + (right - left) * .57;
    state.points = [
      { x: left, y: base },
      { x: left, y: shoulder },
      { x: centreLeft, y: shoulder },
      { x: centreLeft, y: top },
      { x: centreRight, y: top },
      { x: centreRight, y: shoulder },
      { x: right, y: shoulder },
      { x: right, y: base }
    ];
    state.manualWidthPoints=[];
    state.manualHeightPoints=[];
    state.closed = true;
    state.detectedOutlinePending = true;
    const scores = [bands.left.score, bands.right.score, bands.base.score, bands.shoulder.score, bands.top.score];
    const spread = Math.max(...scores) || 1;
    const normalised = scores.reduce((sum, score) => sum + Math.min(1, score / spread), 0) / scores.length;
    state.detectionConfidence = Math.round(55 + normalised * 32);
    $("edgeConfidenceBadge").textContent = `${state.detectionConfidence}% suggestion`;
    setStatus($("edgeDetectionStatus"), "Local fallback suggested. This is not AI detection—drag every corner and verify all measurements.", true);
    setMode("move");
    redrawOverlay();
    generateDrawing();
  };


  const getCurrentPhotoDataUrl = () => {
    if (state.photoDataUrl) return state.photoDataUrl;
    if (!photo.complete || !photo.naturalWidth) return null;

    const canvas = document.createElement("canvas");
    // Send a survey-sized copy, not the multi-megapixel original. This keeps
    // enough detail for glass edges and faceplates while greatly reducing upload
    // and vision-processing time.
    const maxWidth = 1800;
    const scale = Math.min(1, maxWidth / photo.naturalWidth);
    canvas.width = Math.max(1, Math.round(photo.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(photo.naturalHeight * scale));
    const context = canvas.getContext("2d");
    context.drawImage(photo, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.88);
  };

  const detectEdges = async () => {
    const imageDataUrl = getCurrentPhotoDataUrl();
    if (!imageDataUrl) {
      alert("Load a photo first.");
      return;
    }

    const button = $("detectEdgesButton");
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Analysing photo…";
    $("edgeConfidenceBadge").textContent = "Working";
    setStatus(
      $("edgeDetectionStatus"),
      "AI is identifying the intended outer splashback boundary. This may take several seconds."
    );

    try {
      const scanBody={
        imageDataUrl,
        job: {
          customer: $("customerInput").value.trim(),
          piece: $("pieceInput").value.trim(),
          roughWidthMm: Number($("widthInput").value) || null,
          roughHeightMm: Number($("heightInput").value) || null,
          detectionMode: $("detectionModeInput").value,
          surveyorGuidance: $("detectionInstructionInput").value.trim(),
          benchmark: $("detectionModeInput").value === "benchmark" ? {
            name: "Benchmark 001", status: "final adjusted approved production measurements",
            overallWidthMm: 2919, sideHeightMm: 406, centralRiseMm: 727,
            shoulderChecksMm: [385,384],
            horizontalStationsMm: [248,592,620,1212,1240,2049,2175,2357],
            rule: "Use measurements as semantic shape guidance only. Never infer pixel scale or manufacture dimensions from the photograph."
          } : null
        }
      };
      const response=await fetch("/api/detect-outline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scanBody)
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || `Detection failed (${response.status}).`);
      }

      if (!Array.isArray(result.points) || result.points.length < 3) {
        throw new Error("The AI did not return a usable outline.");
      }

      const rect = overlay.getBoundingClientRect();
      pushHistory();
      const cleanedPoints = cleanDetectedPolygon(result.points);
      state.originalAiPoints = cleanedPoints.map((point) => ({
        x: Number(point.x),
        y: Number(point.y)
      }));
      state.detectionNotes = String(result.observations || result.message || "");
      state.detectionMode = $("detectionModeInput").value;
      state.points = cleanedPoints.map((point) => ({
        x: Math.max(0, Math.min(rect.width, Number(point.x) * rect.width)),
        y: Math.max(0, Math.min(rect.height, Number(point.y) * rect.height))
      }));
      const fittings=Array.isArray(result.fittings)?result.fittings:[];
      state.sockets=fittings.map(f=>({
        x:Math.max(0,Math.min(rect.width,Number(f.x)*rect.width)),
        y:Math.max(0,Math.min(rect.height,Number(f.y)*rect.height)),
        type:["single","double","cooker","switch","multiple"].includes(f.type)?f.type:"custom",
        orientation:f.orientation==="vertical"?"vertical":"horizontal",
        confidence:Number(f.confidence)||0,
        detectedWidth:Math.max(12,Number(f.width||0)*rect.width),
        detectedHeight:Math.max(12,Number(f.height||0)*rect.height)
      }));
      state.closed = true;
      state.detectedOutlinePending = true;
      state.detectionConfidence = Math.max(
        1,
        Math.min(99, Math.round(Number(result.confidence) || 50))
      );

      $("edgeConfidenceBadge").textContent = `${state.detectionConfidence}% AI`;
      setStatus(
        $("edgeDetectionStatus"),
        result.message ||
          `AI outline and ${state.sockets.length} fitting${state.sockets.length===1?"":"s"} created. Check and edit them.`,
        true
      );
      setMode("move");
      redrawOverlay();
      generateDrawing();
      renderMeasurementSequence();
    renderHeightMeasurementSequence();
      updateMeasurementConfidence();
    } catch (error) {
      console.error(error);
      $("edgeConfidenceBadge").textContent = "AI unavailable";
      setStatus(
        $("edgeDetectionStatus"),
        `${error.message} Check that the backend is running and OPENAI_API_KEY is configured. You may use the clearly labelled local fallback.`,
        false
      );
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  };


  const detectFittings = async () => {
    const imageDataUrl = getCurrentPhotoDataUrl();
    if (!imageDataUrl) { alert("Load a photo first."); return; }
    if (!state.closed || state.points.length < 3) { alert("Detect and check the splashback outline first."); return; }
    const button = $("detectFittingsButton");
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Finding sockets…";
    setStatus($("fittingDetectionStatus"), "Looking only for electrical sockets and switches inside the splashback area.");
    try {
      const rect = overlay.getBoundingClientRect();
      const outline = state.points.map(p => ({ x: p.x / rect.width, y: p.y / rect.height }));
      const response = await fetch("/api/detect-fittings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl, outline })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `Fitting detection failed (${response.status}).`);
      const fittings = Array.isArray(result.fittings) ? result.fittings : [];
      pushHistory();
      state.sockets = fittings.map(f => ({
        x: Math.max(0, Math.min(rect.width, Number(f.x) * rect.width)),
        y: Math.max(0, Math.min(rect.height, Number(f.y) * rect.height)),
        type: ["single","double","cooker","switch"].includes(f.type) ? f.type : "custom",
        orientation: f.orientation === "vertical" ? "vertical" : "horizontal",
        confidence: Number(f.confidence) || 0,
        detectedWidth: Math.max(12, Number(f.width || 0) * rect.width),
        detectedHeight: Math.max(12, Number(f.height || 0) * rect.height)
      }));
      redrawOverlay();
      generateDrawing();
      renderMeasurementSequence();
    renderHeightMeasurementSequence();
      setStatus($("fittingDetectionStatus"), fittings.length ? `${fittings.length} socket/switch fitting${fittings.length === 1 ? "" : "s"} detected. Check each red box before measurements.` : "No sockets or switches detected. You can still add them manually.", fittings.length > 0);
    } catch (error) {
      console.error(error);
      setStatus($("fittingDetectionStatus"), error.message || "Socket/switch detection failed.");
    } finally {
      button.disabled = false; button.textContent = originalText;
    }
  };


  const normalizedCurrentPoints = () => {
    const rect = overlay.getBoundingClientRect();
    if (!rect.width || !rect.height) return [];
    return state.points.map((point) => ({
      x: Number((point.x / rect.width).toFixed(6)),
      y: Number((point.y / rect.height).toFixed(6))
    }));
  };

  const saveDetectionRun = () => {
    if (!state.originalAiPoints.length || state.points.length < 3) {
      setStatus(
        $("benchmarkStatus"),
        "Run AI detection and correct the outline before saving a benchmark result."
      );
      return;
    }

    const correctedPoints = normalizedCurrentPoints();
    const changedPointCount = correctedPoints.reduce((count, point, index) => {
      const original = state.originalAiPoints[index];
      if (!original) return count + 1;
      const shift = Math.hypot(point.x - original.x, point.y - original.y);
      return count + (shift > 0.003 ? 1 : 0);
    }, Math.max(0, correctedPoints.length - state.originalAiPoints.length));

    const record = {
      schema: "splashcad-detection-benchmark-v1",
      savedAt: new Date().toISOString(),
      benchmark: {
        name: "Benchmark 001",
        source: "Final adjusted production survey supplied by Advanced Glass",
        dimensionsAreAuthoritative: true,
        overallWidthMm: 2919,
        sideHeightMm: 406,
        centralRiseMm: 727,
        shoulderChecksMm: [385, 384],
        horizontalStationsMm: [248, 592, 620, 1212, 1240, 2049, 2175, 2357]
      },
      job: {
        customer: $("customerInput").value.trim(),
        piece: $("pieceInput").value.trim()
      },
      detection: {
        mode: state.detectionMode,
        confidence: state.detectionConfidence,
        notes: state.detectionNotes,
        aiPoints: state.originalAiPoints,
        correctedPoints,
        changedPointCount
      },
      warning: "Photo detection records shape corrections only. Approved production dimensions remain authoritative."
    };

    const blob = new Blob([JSON.stringify(record, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `Benchmark_001_detection_${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);

    const history = JSON.parse(localStorage.getItem("splashcadDetectionRuns") || "[]");
    history.push(record);
    localStorage.setItem("splashcadDetectionRuns", JSON.stringify(history.slice(-100)));

    setStatus(
      $("benchmarkStatus"),
      `Detection run saved. ${changedPointCount} point${changedPointCount === 1 ? "" : "s"} changed from the AI suggestion.`,
      true
    );
  };

  // Alpha 5.2.9 compatibility: the old verification panel was replaced by
  // Production Measurements in Alpha 5.2.9. Do not query removed DOM controls.
  const measurementValues = () => [
    "prodOverallWidth", "prodPoint8", "prodPoint7", "prodPoint4", "prodPoint3",
    "prodLeftHeight", "prodRightHeight", "prodExtractorHeight"
  ].map((id) => {
    const el = $(id);
    return el ? Number(el.value) : NaN;
  }).filter((value) => Number.isFinite(value) && value > 0);

  const updateMeasurementConfidence = () => {
    const values = measurementValues();
    const status = $("productionMeasurementStatus");
    if (!status) return;
    if (!values.length) {
      setStatus(status, "Enter widths first, then heights.");
    } else if (values.length < 8) {
      setStatus(status, `${values.length} production measurements entered. Complete widths first, then heights.`);
    } else {
      setStatus(status, "Production measurements entered. Press Apply measurements.", true);
    }
  };

  const fileToDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("The photo could not be read."));
    reader.readAsDataURL(file);
  });

  const isHeicFile = (file) => /^image\/(heic|heif)$/i.test(file?.type || "") || ((!file?.type || file.type === "application/octet-stream") && /\.(heic|heif)$/i.test(file?.name || ""));

  const loadPhotoFile = async (file) => {
    if (!file) return;
    try {
      let imageDataUrl = await fileToDataUrl(file);
      if (isHeicFile(file)) {
        setStatus($("edgeDetectionStatus"), "Converting HEIC photo…");
        const response = await fetch("/api/convert-heic", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageDataUrl })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.imageDataUrl) throw new Error(data.error || "HEIC conversion failed.");
        imageDataUrl = data.imageDataUrl;
      }
      state.photoDataUrl = imageDataUrl;
      photo.onload = () => {
        state.points = [];
        state.manualWidthPoints = [];
        state.manualHeightPoints = [];
        state.sockets = [];
    state.notches = [];
        state.closed = false;
        state.calibrationPoints = [];
        state.mmPerPixel = null;
        state.detectionConfidence = 0;
        state.detectedOutlinePending = false;
        $("edgeConfidenceBadge").textContent = "Not run";
        setStatus($("edgeDetectionStatus"), `${isHeicFile(file) ? "HEIC converted. " : "Photo loaded. "}Click Scan outline + sockets.`);
        $("calibrationScaleOutput").value = "Not calibrated";
        setStatus($("calibrationStatus"), "No calibration points selected.");
        requestAnimationFrame(resizeOverlay);
      };
      photo.onerror = () => {
        state.photoDataUrl = null;
        setStatus($("edgeDetectionStatus"),"This photo format cannot be decoded by this Windows browser. Save or export it as JPG, PNG or WebP and try again.",false);
      };
      photo.src = state.photoDataUrl;
    } catch (error) {
      state.photoDataUrl = null;
      const message = error instanceof Error ? error.message : "This photo could not be loaded.";
      setStatus($("edgeDetectionStatus"), message, false);
      alert(message);
    }
  };

  overlay.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    const point = localPoint(event);

    if (state.mode === "add-width" || state.mode === "add-height") {
      if (state.closed && state.points.length >= 2) {
        const hit = nearestOutlineSegment(point);
        if (!hit) return;
        pushHistory();
        const measurementType=state.mode === "add-width" ? "width" : "height";
        const newPoint={...hit.point,_freeOutlinePoint:true,_measurementType:measurementType};
        const newIndex=hit.segmentIndex+1;
        state.points.splice(newIndex,0,newPoint);
        redrawOverlay();
        generateDrawing();
        renderMeasurementSequence();
        renderHeightMeasurementSequence();
        persistWorkingJob();
        setMode("move");
        setStatus($("photoStatus"), `Outline point added. Drag the new blue point into position; add more points as needed.`, true);
      } else {
        setStatus($("photoStatus"),"Finish the outline before adding a measurement station.",false);
      }
      return;
    }

    if (state.mode === "square-corner") {
      const cornerIndex=nearestIndex(point,state.points,38);
      if(cornerIndex<0){
        setStatus($("photoStatus"),"Tap directly on the top or bottom outline corner to mark it square.",false);
        return;
      }
      pushHistory();
      state.squareCornerIndex=cornerIndex;
      const ys=(state.points||[]).map(p=>Number(p.y)).filter(Number.isFinite);
      const xs=(state.points||[]).map(p=>Number(p.x)).filter(Number.isFinite);
      const midY=ys.length?(Math.min(...ys)+Math.max(...ys))/2:Number(point.y);
      const midX=xs.length?(Math.min(...xs)+Math.max(...xs))/2:Number(point.x);
      const position=Number(state.points[cornerIndex].y)<=midY?"top":"bottom";
      state.offSquareSquareCorner=Number(state.points[cornerIndex].x)<=midX?"left":"right";
      persistWorkingJob(); redrawOverlay(); generateDrawing(); setMode("move");
      setStatus($("photoStatus"),`Corner ${cornerIndex+1} marked as the square 90° ${position} corner.`,true);
      return;
    }

    if (state.mode === "move") {
      const coarse=matchMedia('(pointer:coarse)').matches;
      const socketIndex = nearestIndex(point, state.sockets, coarse?52:36);
      const notchIndex = nearestIndex(point, state.notches, coarse?46:32);
      const pointIndex = nearestIndex(point, state.points, coarse?44:26);

      if (socketIndex >= 0 || notchIndex >= 0 || pointIndex >= 0) {
        pushHistory();

        // Priority remains fittings -> notches -> blue outline points.
        // The 4.9 fitting-size panel must never block point/notch dragging.
        if (socketIndex >= 0) {
          state.draggingSocketIndex = socketIndex;
          state.selectedSocketIndex = socketIndex;
          const selectedSocket = state.sockets[socketIndex];
          if (selectedSocket.type !== "hole" && $("fittingSizePanel")) {
            const spec = cutoutSpec(selectedSocket);
            $("fittingWidthInput").value = Math.round(Number(selectedSocket.editWidth || spec.width));
            $("fittingHeightInput").value = Math.round(Number(selectedSocket.editHeight || spec.height));
            $("fittingSizePanel").classList.remove("hidden");
            $("fittingSizePanel").classList.add("selected");
          }
        } else if (notchIndex >= 0) {
          state.draggingNotchIndex = notchIndex;
        } else {
          state.draggingPointIndex = pointIndex;
        }

        overlay.setPointerCapture?.(event.pointerId);
      }
      return;
    }

    if (state.mode === "calibrate") {
      if (state.calibrationPoints.length >= 2) {
        state.calibrationPoints = [];
        state.mmPerPixel = null;
      }
      state.calibrationPoints.push(point);
      $("calibrationScaleOutput").value = "Not calibrated";
      setStatus(
        $("calibrationStatus"),
        state.calibrationPoints.length === 1
          ? "First calibration point selected. Select the second point."
          : "Two calibration points selected. Enter the known distance and apply calibration.",
        state.calibrationPoints.length === 2
      );
      redrawOverlay();
      return;
    }

    if (state.mode === "socket") {
      let extra={};
      if(state.cutoutType==="hole") {
        const entered=window.prompt("Hole diameter Ø mm", "20");
        if(entered===null) { setMode("move"); return; }
        const d=Number(entered);
        if(!(d>0)) { alert("Enter a valid hole diameter in mm."); return; }
        extra={editDiameter:d,editWidth:d,editHeight:d};
      } else if(state.cutoutType==="custom") {
        const w=Number(state.pendingCustomCutout?.width);
        const h=Number(state.pendingCustomCutout?.height);
        if(!(w>0&&h>0)) { setMode("move"); return; }
        extra={editWidth:w,editHeight:h};
      }
      pushHistory();
      state.sockets.push({ ...point, type: state.cutoutType, ...extra });
      if(state.cutoutType==="custom") state.pendingCustomCutout=null;
      ensureMeasureIds();
      redrawOverlay();
      if (state.points.length >= 3) generateDrawing();
      renderMeasurementSequence();
      renderHeightMeasurementSequence();
      setMode("move");
      return;
    }

    if (state.mode === "radius") {
      const cornerIndex=nearestIndex(point,state.points,38);
      if(cornerIndex<0){ setStatus($("photoStatus"),"Tap directly on the corner you want to radius.",false); return; }
      const entered=window.prompt(`Radius for corner ${cornerIndex+1} (mm)`, String(Math.round(Number(state.cornerRadii?.[cornerIndex])||10)));
      if(entered===null){ setMode("move"); return; }
      const r=Number(entered);
      if(!(r>0)){ alert("Enter a valid radius in mm."); return; }
      pushHistory();
      state.cornerRadii[String(cornerIndex)]=r;
      persistWorkingJob(); generateDrawing(); setMode("move");
      setStatus($("photoStatus"),`Corner ${cornerIndex+1} set to R${Math.round(r)} mm.`,true);
      return;
    }

    if (state.mode === "notch") {
      pushHistory();
      state.notches.push(nearestPointOnOutline(point));
      redrawOverlay();
      if (state.points.length >= 3) generateDrawing();
      renderMeasurementSequence();
      renderHeightMeasurementSequence();
      setStatus($("photoStatus"),`Notch N${state.notches.length} added. Add another or use Select / move to adjust it.`,true);
      return;
    }

    if (state.mode === "erase") {
      const manualWidthIndex = nearestIndex(point, state.manualWidthPoints||[], 24);
      const manualHeightIndex = nearestIndex(point, state.manualHeightPoints||[], 24);
      const pointIndex = nearestIndex(point, state.points);
      const socketIndex = nearestIndex(point, state.sockets);
      const notchIndex = nearestIndex(point, state.notches);

      if (manualWidthIndex >= 0) {
        pushHistory();
        state.manualWidthPoints.splice(manualWidthIndex,1);
      } else if (manualHeightIndex >= 0) {
        pushHistory();
        state.manualHeightPoints.splice(manualHeightIndex,1);
      } else if (pointIndex >= 0) {
        pushHistory();
        state.points.splice(pointIndex, 1);
        if(Number(state.squareCornerIndex)===pointIndex) state.squareCornerIndex=null;
        else if(Number.isInteger(Number(state.squareCornerIndex)) && Number(state.squareCornerIndex)>pointIndex) state.squareCornerIndex=Number(state.squareCornerIndex)-1;
        state.closed = false;
      } else if (socketIndex >= 0) {
        pushHistory();
        state.sockets.splice(socketIndex, 1);
      } else if (notchIndex >= 0) {
        pushHistory();
        state.notches.splice(notchIndex, 1);
      }

      redrawOverlay();
      if (state.points.length >= 3) generateDrawing();
      renderMeasurementSequence();
      renderHeightMeasurementSequence();
    }
  });

  let liveDrawingFrame = 0;
  overlay.addEventListener("pointermove", (event) => {
    if (
      state.draggingPointIndex < 0 &&
      state.draggingSocketIndex < 0 &&
      state.draggingNotchIndex < 0
    ) return;

    event.preventDefault();
    const point = localPoint(event);

    if (state.draggingPointIndex >= 0) {
      const i = state.draggingPointIndex;
      const n = state.points.length;
      const prevI = (i - 1 + n) % n;
      const nextI = (i + 1) % n;
      const oldPoint = { ...state.points[i] };
      const prev = state.points[prevI];
      const next = state.points[nextI];

      // Preserve the orientation of both connected runs while the corner moves.
      const prevWasHorizontal = Math.abs(oldPoint.y - prev.y) <= Math.abs(oldPoint.x - prev.x);
      const nextWasHorizontal = Math.abs(oldPoint.y - next.y) <= Math.abs(oldPoint.x - next.x);

      state.points[i] = {...oldPoint,...point};

      if (!oldPoint._freeOutlinePoint) {
        if (prevWasHorizontal) state.points[prevI] = { ...prev, y: point.y };
        else state.points[prevI] = { ...prev, x: point.x };

        if (nextWasHorizontal) state.points[nextI] = { ...next, y: point.y };
        else state.points[nextI] = { ...next, x: point.x };
      }
    } else if (state.draggingSocketIndex >= 0) {
      state.sockets[state.draggingSocketIndex].x = point.x;
      state.sockets[state.draggingSocketIndex].y = point.y;
    } else if (state.draggingNotchIndex >= 0) {
      state.notches[state.draggingNotchIndex] = nearestPointOnOutline(point);
    }

    redrawOverlay();
    if (!liveDrawingFrame) {
      liveDrawingFrame = requestAnimationFrame(() => {
        liveDrawingFrame = 0;
        if (state.points.length >= 3) generateDrawing();
      });
    }
  });

  const endDrag = () => {
    const changed =
      state.draggingPointIndex >= 0 ||
      state.draggingSocketIndex >= 0 ||
      state.draggingNotchIndex >= 0;
    state.draggingPointIndex = -1;
    state.draggingSocketIndex = -1;
    state.draggingNotchIndex = -1;
    if (changed) {
      redrawOverlay();
      generateDrawing();
    }
  };

  overlay.addEventListener("pointerup", endDrag);
  overlay.addEventListener("pointercancel", endDrag);

  const scaledPoints = () => {
    if (state.points.length < 3) return [];

    if (Number.isFinite(state.mmPerPixel) && state.mmPerPixel > 0) {
      const origin = state.points[0];
      return state.points.map((point) => ({
        x: (point.x - origin.x) * state.mmPerPixel,
        y: (origin.y - point.y) * state.mmPerPixel
      }));
    }

    const xs = state.points.map((point) => point.x);
    const ys = state.points.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const width = Number($("widthInput").value) || 1;
    const height = Number($("heightInput").value) || 1;

    return state.points.map((point) => ({
      x: ((point.x - minX) / (maxX - minX || 1)) * width,
      y: ((maxY - point.y) / (maxY - minY || 1)) * height
    }));
  };

  const scaledMeasurementPoint = (point) => {
    if(!point || state.points.length<3) return null;
    if(Number.isFinite(state.mmPerPixel) && state.mmPerPixel>0){
      const origin=state.points[0];
      return {x:(point.x-origin.x)*state.mmPerPixel,y:(origin.y-point.y)*state.mmPerPixel};
    }
    const xs=state.points.map(p=>p.x), ys=state.points.map(p=>p.y);
    const minX=Math.min(...xs), maxX=Math.max(...xs), minY=Math.min(...ys), maxY=Math.max(...ys);
    const width=Number($("widthInput").value)||1, height=Number($("heightInput").value)||1;
    return {x:((point.x-minX)/(maxX-minX||1))*width,y:((maxY-point.y)/(maxY-minY||1))*height};
  };

  const polygonArea = (vertices) => {
    let sum = 0;
    vertices.forEach((vertex, index) => {
      const next = vertices[(index + 1) % vertices.length];
      sum += vertex.x * next.y - next.x * vertex.y;
    });
    return Math.abs(sum) / 2;
  };

  const polygonPerimeter = (vertices) => {
    return vertices.reduce((total, vertex, index) => {
      const next = vertices[(index + 1) % vertices.length];
      return total + Math.hypot(next.x - vertex.x, next.y - vertex.y);
    }, 0);
  };


  const scaledSocket = (socket, vertices) => {
    if (Number.isFinite(state.mmPerPixel) && state.mmPerPixel > 0 && state.points.length) {
      const origin = state.points[0];
      return {
        x: (socket.x - origin.x) * state.mmPerPixel,
        y: (origin.y - socket.y) * state.mmPerPixel
      };
    }

    // IMPORTANT: fittings use the exact same outline-bounds transform as the glass.
    // This keeps a fitting at the same relative position after manual movement.
    const xs = state.points.map((p) => p.x);
    const ys = state.points.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const width = Number($("widthInput").value) || 1;
    const height = Number($("heightInput").value) || 1;
    return {
      x: ((socket.x - minX) / (maxX - minX || 1)) * width,
      y: ((maxY - socket.y) / (maxY - minY || 1)) * height
    };
  };

  const scaledNotch = (notch) => {
    if (Number.isFinite(state.mmPerPixel) && state.mmPerPixel > 0 && state.points.length) {
      const origin = state.points[0];
      return {
        x: (notch.x-origin.x)*state.mmPerPixel,
        y: (origin.y-notch.y)*state.mmPerPixel
      };
    }
    const xs=state.points.map(p=>p.x), ys=state.points.map(p=>p.y);
    const minX=Math.min(...xs), maxX=Math.max(...xs), minY=Math.min(...ys), maxY=Math.max(...ys);
    const width=Number($("widthInput").value)||1;
    const height=Number($("heightInput").value)||1;
    return {
      x: ((notch.x-minX)/(maxX-minX||1))*width,
      y: ((maxY-notch.y)/(maxY-minY||1))*height
    };
  };

  const exportDxf = () => {
    // The approved scan is the immutable drawing geometry. Measurements annotate
    // this outline; they must never rebuild, replace or distort it.
    const vertices = scaledPoints();
    if (vertices.length < 3) {
      alert("Select at least three corners first.");
      return;
    }

    const lines = [
      "0", "SECTION", "2", "HEADER", "0", "ENDSEC",
      "0", "SECTION", "2", "ENTITIES"
    ];

    const addLine = (x1, y1, x2, y2, layer = "GLASS_OUTLINE") => {
      lines.push(
        "0", "LINE",
        "8", layer,
        "10", String(x1.toFixed(3)),
        "20", String(y1.toFixed(3)),
        "30", "0",
        "11", String(x2.toFixed(3)),
        "21", String(y2.toFixed(3)),
        "31", "0"
      );
    };

    // Alpha 6.0.8: export selected corner radii as segmented true circular arcs.
    const radiusGeom=vertices.map((cur,i)=>{
      const r=Number(state.cornerRadii?.[String(i)]); if(!(r>0)) return null;
      const prev=vertices[(i-1+vertices.length)%vertices.length], next=vertices[(i+1)%vertices.length];
      const u1={x:prev.x-cur.x,y:prev.y-cur.y},u2={x:next.x-cur.x,y:next.y-cur.y};
      const l1=Math.hypot(u1.x,u1.y),l2=Math.hypot(u2.x,u2.y); if(l1<1||l2<1) return null;
      u1.x/=l1;u1.y/=l1;u2.x/=l2;u2.y/=l2;
      const theta=Math.acos(Math.max(-0.9999,Math.min(0.9999,u1.x*u2.x+u1.y*u2.y)));
      const t=Math.min(r/Math.tan(theta/2),l1*.45,l2*.45); if(!(t>0)) return null;
      const p1={x:cur.x+u1.x*t,y:cur.y+u1.y*t},p2={x:cur.x+u2.x*t,y:cur.y+u2.y*t};
      const bx=u1.x+u2.x,by=u1.y+u2.y,bl=Math.hypot(bx,by); if(bl<1e-6) return null;
      const d=r/Math.sin(theta/2), c={x:cur.x+bx/bl*d,y:cur.y+by/bl*d};
      return {p1,p2,c,r};
    });
    const arcPoints=g=>{
      if(!g) return [];
      const a1=Math.atan2(g.p1.y-g.c.y,g.p1.x-g.c.x),a2=Math.atan2(g.p2.y-g.c.y,g.p2.x-g.c.x);
      let da=Math.atan2(Math.sin(a2-a1),Math.cos(a2-a1));
      const pts=[]; for(let j=0;j<=8;j++){const a=a1+da*j/8;pts.push({x:g.c.x+g.r*Math.cos(a),y:g.c.y+g.r*Math.sin(a)});} return pts;
    };
    vertices.forEach((vertex,index)=>{
      if(!state.closed && index===vertices.length-1) return;
      const nextIndex=(index+1)%vertices.length, next=vertices[nextIndex];
      const start=radiusGeom[index]?.p2||vertex, end=radiusGeom[nextIndex]?.p1||next;
      addLine(start.x,start.y,end.x,end.y);
      const ap=arcPoints(radiusGeom[nextIndex]); for(let j=1;j<ap.length;j++) addLine(ap[j-1].x,ap[j-1].y,ap[j].x,ap[j].y);
    });

    state.sockets.forEach((socket,index) => {
      const centre = scaledSocket(socket, vertices);
      const spec = cutoutSpec(socket);
      const edited = fittingFaceplateSize(socket);
      const isVertical = socket.type==="cooker" || socket.orientation==="vertical";
      const width = isVertical ? Math.min(edited.width,edited.height) : edited.width;
      const height = isVertical ? Math.max(edited.width,edited.height) : edited.height;
      const x1 = centre.x - width / 2;
      const x2 = centre.x + width / 2;
      const y1 = centre.y - height / 2;
      const y2 = centre.y + height / 2;
      addLine(x1, y1, x2, y1, "SOCKETS");
      addLine(x2, y1, x2, y2, "SOCKETS");
      addLine(x2, y2, x1, y2, "SOCKETS");
      addLine(x1, y2, x1, y1, "SOCKETS");
    });


    state.notches.forEach((notch) => {
      const p = scaledNotch(notch);
      const r = 6;
      addLine(p.x-r, p.y, p.x+r, p.y, "NOTCHES");
      addLine(p.x, p.y-r, p.x, p.y+r, "NOTCHES");
    });

    lines.push("0", "ENDSEC", "0", "EOF");

    const blob = new Blob([lines.join("\n")], { type: "application/dxf" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    const safeName = ($("pieceInput").value || "SplashCAD").replace(/[^a-z0-9_-]+/gi, "_");
    link.download = `${safeName}.dxf`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const clearDrawing = () => {
    drawingCtx.clearRect(0, 0, drawing.width, drawing.height);
    drawingCtx.fillStyle = "#f8fafc";
    drawingCtx.fillRect(0, 0, drawing.width, drawing.height);
  };



  const readPositiveMeasurement = (id) => {
    const el = $(id);
    const value = Number(el?.value);
    return Number.isFinite(value) && value > 0 ? value : null;
  };

  const fittingFaceplateSize = (socket) => {
    const spec = cutoutSpec(socket);
    if(socket?.type === "hole") {
      const diameter = Number(socket.editDiameter) > 0 ? Number(socket.editDiameter) : spec.width;
      return { width: diameter, height: diameter };
    }
    const width = Number(socket.editWidth) > 0 ? Number(socket.editWidth) : spec.width;
    const height = Number(socket.editHeight) > 0 ? Number(socket.editHeight) : spec.height;
    return { width, height };
  };


  // Detection/editor state can contain a manual marker on top of an automatic
  // shoulder marker. Treat coincident markers as one manufacturing notch so the
  // benchmark remains the approved 8-width / 9-height sequence.
  const measurementNotchEntries = () => {
    const entries=[];
    (state.notches||[]).forEach((notch,index)=>{
      const x=Number(notch?.x), y=Number(notch?.y);
      if(!Number.isFinite(x) || !Number.isFinite(y)) return;
      const duplicateIndex=entries.findIndex(item=>
        Math.abs(Number(item.notch.x)-x)<18 && Math.abs(Number(item.notch.y)-y)<18
      );
      if(duplicateIndex<0){
        entries.push({notch,index});
      } else if(notch.shoulderAuto && !entries[duplicateIndex].notch?.shoulderAuto){
        entries[duplicateIndex]={notch,index};
      }
    });
    return entries;
  };
  const measurementNotches = () => measurementNotchEntries().map(item=>item.notch);

  const horizontalPerimeterRunsAboveBottom = () => {
    const pts = state.points || [];
    if (pts.length < 3) return 0;

    const ys = pts.map(p => Number(p.y)).filter(Number.isFinite);
    if (!ys.length) return 0;

    // Image coordinates increase downward; bottom datum is the greatest y.
    const bottomY = Math.max(...ys);
    let runs = 0;

    for (let i=0; i<pts.length; i++) {
      const a=pts[i];
      const b=pts[(i+1)%pts.length];
      if (!a || !b) continue;

      const dx=Math.abs(Number(b.x)-Number(a.x));
      const dy=Math.abs(Number(b.y)-Number(a.y));
      if (!(dx > 0)) continue;

      // Same horizontal/square-line tolerance already used by the editor:
      // classify the run as horizontal when its x travel dominates.
      if (dy <= dx * 0.18) {
        const runY=(Number(a.y)+Number(b.y))/2;
        const bottomTolerance=Math.max(6, dx*0.015);
        if (Math.abs(runY-bottomY) > bottomTolerance) runs += 1;
      }
    }
    return runs;
  };

  const requiredMeasurementCounts = () => {
    const fittingCount=(state.sockets||[]).length;
    const notchCount=measurementNotches().length;
    const upperHorizontalRuns=horizontalPerimeterRunsAboveBottom();

    // Alpha 6.0.10: validate the exact rows rendered to the surveyor.
    // A deliberately added outline point owns only its selected width OR height row.
    return {
      widths: widthMeasurementFeatureMap().length,
      heights: heightMeasurementFeatureMap().length,
      fittingCount,
      notchCount,
      upperHorizontalRuns
    };
  };

  const updateMeasurementCountBadge = () => {
    const counts=requiredMeasurementCounts();
    const badge=$("measurementCountBadge");
    if (badge) badge.textContent=`Detected: ${counts.widths} widths · ${counts.heights} heights`;
    return counts;
  };

  const autoShoulderNotchInfo = () => {
    const autos=(state.notches||[])
      .map((notch,index)=>({notch,index}))
      .filter(item=>item.notch?.shoulderAuto)
      .sort((a,b)=>Number(a.notch.x)-Number(b.notch.x));

    return autos.map((item,i)=>({
      ...item,
      side: autos.length===1 ? "left" : (i===0 ? "left" : i===autos.length-1 ? "right" : `mid${i}`)
    }));
  };

  // Alpha 6.0.8 — feature-stable measurement identities.
  // Measurements follow the physical feature when a hole/notch is inserted, moved or removed;
  // only the visible sequence number is recalculated.
  const ensureMeasureIds = () => {
    let next=1;
    [...(state.sockets||[]),...(state.notches||[])].forEach(item=>{
      const m=String(item?._measureId||"").match(/^(?:f|n)(\d+)$/);
      if(m) next=Math.max(next,Number(m[1])+1);
    });
    (state.sockets||[]).forEach(item=>{ if(!item._measureId) item._measureId=`f${next++}`; });
    (state.notches||[]).forEach(item=>{ if(!item._measureId) item._measureId=`n${next++}`; });
  };

  const widthFeatureKey = (f) => f.type==="fitting" ? `wf:${state.sockets?.[f.socketIndex]?._measureId||f.socketIndex}`
    : f.type==="notch-edge" ? `wn:${state.notches?.[f.notchIndex]?._measureId||f.notchIndex}:${f.edge}`
    : f.type==="measurement-point" ? `wp:${f.measureId}`
    : `wo:${f.segmentIndex}`;
  const heightFeatureKey = (f) => f.type==="fitting" ? `hf:${state.sockets?.[f.socketIndex]?._measureId||f.socketIndex}`
    : f.type==="notch" ? `hn:${state.notches?.[f.notchIndex]?._measureId||f.notchIndex}`
    : f.type==="measurement-point" ? `hp:${f.measureId}`
    : `ho:${f.segmentIndex}`;

  const migrateSequentialRecords = (records, features, legacyPrefix, keyFn) => {
    const list=records||[];
    if(!list.length || !list.some(r=>new RegExp(`^${legacyPrefix}\\d+$`).test(String(r.key)))) return list;
    const legacy=new Map(list.map(r=>[String(r.key),r.value]));
    return features.map((f,i)=>({key:keyFn(f),value:legacy.get(`${legacyPrefix}${i+1}`)??null}));
  };

  const widthMeasurementFeatureMap = () => {
    ensureMeasureIds();
    const raw=[];

    const datumSort=(a,b)=>Number(a.x)-Number(b.x);
    const shoulderInfo=autoShoulderNotchInfo();
    const shoulderIndexes=new Set(shoulderInfo.map(info=>info.index));
    const notchEntries=measurementNotchEntries();

    const fittingFeatures=(state.sockets||[]).map((socket,index)=>{
      const size=fittingFaceplateSize(socket);
      const isVertical=socket.type==="cooker" || socket.orientation==="vertical";
      const faceW=socket.type==="hole" ? 0 : (isVertical ? Math.min(size.width,size.height) : size.width);
      return {type:"fitting",socketIndex:index,x:Number(socket.x),faceWidth:faceW,hole:socket.type==="hole"};
    }).filter(f=>Number.isFinite(f.x)).sort(datumSort);

    const notchEdges=(entry)=>{
      const x=Number(entry.notch.x);
      if(!Number.isFinite(x)) return [];
      const side=shoulderInfo.find(info=>info.index===entry.index)?.side||null;
      return [
        {type:"notch-edge",notchIndex:entry.index,side,edge:"left",x:x-7},
        {type:"notch-edge",notchIndex:entry.index,side,edge:"right",x:x+7}
      ].sort(datumSort);
    };

    const shoulderEdges=notchEntries
      .filter(entry=>shoulderIndexes.has(entry.index))
      .sort((a,b)=>Number(a.notch.x)-Number(b.notch.x))
      .flatMap(notchEdges);
    const manualEdges=notchEntries
      .filter(entry=>!shoulderIndexes.has(entry.index))
      .sort((a,b)=>Number(a.notch.x)-Number(b.notch.x))
      .flatMap(notchEdges);

    // Alpha 6.0.4 — SURVEY SEQUENCE IS SEMANTIC, NOT X-SORTED.
    // Approved full-hob workflow:
    //   first datum-side fitting,
    //   the two shoulder notches (4 edges),
    //   any manually-added notch edges,
    //   then the remaining fittings.
    // This preserves the user's entered sequence exactly. In the current benchmark
    // that is 243, 595, 623, 1215, 1237, 2100, 2110, 2044, 2170, 2352.
    const fitOrdered=state.measurementDirection==="rtl" ? fittingFeatures.slice().reverse() : fittingFeatures.slice();
    const shoulderOrdered=state.measurementDirection==="rtl" ? shoulderEdges.slice().reverse() : shoulderEdges.slice();
    const manualOrdered=state.measurementDirection==="rtl" ? manualEdges.slice().reverse() : manualEdges.slice();
    if(fitOrdered.length) raw.push(fitOrdered.shift());
    raw.push(...shoulderOrdered,...manualOrdered,...fitOrdered);

    // Future topology fallback: add any internal vertical transition not already
    // represented above. Append it after explicit notches and before no further
    // semantic guessing; its row remains stable once created.
    const pts=state.points||[];
    if(pts.length>=3){
      const xs=pts.map(p=>Number(p.x)).filter(Number.isFinite);
      const minX=Math.min(...xs), maxX=Math.max(...xs);
      const covered=notchEntries.map(e=>Number(e.notch.x)).filter(Number.isFinite);
      const extras=[];
      for(let i=0;i<pts.length;i++){
        const a=pts[i];
        let b=pts[(i+1)%pts.length];
        if(!a||!b || a._manualMeasure) continue;
        // A manual measurement point splits one physical edge into two screen
        // segments. Collapse those two segments back to the original physical
        // edge so its existing measurement remains, then add the selected
        // manual width/height as a separate feature below.
        if(b._manualMeasure){
          let step=2;
          while(step<pts.length && pts[(i+step)%pts.length]?._manualMeasure) step++;
          const c=pts[(i+step)%pts.length];
          if(!c) continue;
          b=c;
        }
        const dx=Math.abs(Number(b.x)-Number(a.x));
        const dy=Math.abs(Number(b.y)-Number(a.y));
        if(!(dy>dx*3)) continue;
        const x=(Number(a.x)+Number(b.x))/2;
        if(Math.abs(x-minX)<8 || Math.abs(x-maxX)<8) continue;
        if(covered.some(nx=>Math.abs(nx-x)<18)) continue;
        if(!raw.some(f=>Math.abs(Number(f.x)-x)<8)) extras.push({type:"outline-x",segmentIndex:i,x});
      }
      extras.sort(datumSort);
      if(state.measurementDirection==="rtl") extras.reverse();
      raw.push(...extras);
    }

    // Manual measurement stations are independent of the locked outline geometry.
    (state.manualWidthPoints||[]).forEach((pt,pointIndex)=>{
      if(!Number.isFinite(Number(pt.x))) return;
      const feature={type:"measurement-point",pointIndex,measureId:pt._measureId||pointIndex,x:Number(pt.x),y:Number(pt.y)};
      let at=raw.length;
      if(state.measurementDirection==="rtl"){
        const j=raw.findIndex(f=>Number.isFinite(Number(f.x))&&Number(f.x)<feature.x);
        if(j>=0) at=j;
      }else{
        const j=raw.findIndex(f=>Number.isFinite(Number(f.x))&&Number(f.x)>feature.x);
        if(j>=0) at=j;
      }
      raw.splice(at,0,feature);
    });

    return raw.map((f,i)=>({...f,seq:i+1,key:widthFeatureKey(f)}));
  };

  const heightMeasurementFeatureMap = () => {
    ensureMeasureIds();
    const pts=state.points||[];
    const outlineRuns=[];

    if(pts.length>=3){
      const ys=pts.map(p=>Number(p.y)).filter(Number.isFinite);
      const bottomY=Math.max(...ys);
      const outlineXs=pts.map(p=>Number(p.x)).filter(Number.isFinite);
      const outlineMinX=Math.min(...outlineXs), outlineMaxX=Math.max(...outlineXs);
      const edgeTol=Math.max(8,(outlineMaxX-outlineMinX)*0.015);
      for(let i=0;i<pts.length;i++){
        const a=pts[i];
        let b=pts[(i+1)%pts.length];
        if(!a||!b || a._manualMeasure) continue;
        if(b._manualMeasure){
          let step=2;
          while(step<pts.length && pts[(i+step)%pts.length]?._manualMeasure) step++;
          const c=pts[(i+step)%pts.length];
          if(!c) continue;
          b=c;
        }
        const dx=Math.abs(Number(b.x)-Number(a.x));
        const dy=Math.abs(Number(b.y)-Number(a.y));
        if(!(dx>0 && dy<=dx*0.18)) continue;
        const runY=(Number(a.y)+Number(b.y))/2;
        const bottomTolerance=Math.max(6,dx*0.015);
        if(Math.abs(runY-bottomY)<=bottomTolerance) continue;
        const ax=Number(a.x), bx=Number(b.x);
        const stationX=state.measurementDirection==="rtl"?Math.max(ax,bx):Math.min(ax,bx);
        const touchesLeft=Math.min(ax,bx)<=outlineMinX+edgeTol;
        const touchesRight=Math.max(ax,bx)>=outlineMaxX-edgeTol;
        outlineRuns.push({type:"outline-y",segmentIndex:i,x:stationX,y:runY,
          outerSide:touchesLeft&&!touchesRight?"left":touchesRight&&!touchesLeft?"right":null});
      }
    }

    const shoulderInfo=autoShoulderNotchInfo();
    const shoulderIndexes=new Set(shoulderInfo.map(info=>info.index));
    const notchEntries=measurementNotchEntries();
    const shoulders=notchEntries.filter(e=>shoulderIndexes.has(e.index)).sort((a,b)=>Number(a.notch.x)-Number(b.notch.x));
    const manuals=notchEntries.filter(e=>!shoulderIndexes.has(e.index)).sort((a,b)=>Number(a.notch.x)-Number(b.notch.x));
    const fittings=(state.sockets||[]).map((socket,index)=>({type:"fitting",socketIndex:index,x:Number(socket.x),y:Number(socket.y)}))
      .filter(f=>Number.isFinite(f.x)).sort((a,b)=>a.x-b.x);
    const runsByX=outlineRuns.slice().sort((a,b)=>a.x-b.x);

    // Alpha 6.0.4 — exact approved height workflow for the full-hob topology.
    // H1 outside datum edge, H2 first fitting, H3 left shoulder-notch bottom,
    // H4 extractor top, H5 right shoulder-notch bottom, then manual-notch heights,
    // then remaining fittings, and LAST = opposite outside edge.
    const raw=[];
    let leftOuter=runsByX.find(r=>r.outerSide==="left")||runsByX[0]||null;
    let rightOuter=[...runsByX].reverse().find(r=>r.outerSide==="right")||runsByX[runsByX.length-1]||null;
    const extractorRun=runsByX.length ? runsByX.reduce((best,r)=>Number(r.y)<Number(best.y)?r:best,runsByX[0]) : null;
    const fitOrdered=state.measurementDirection==="rtl"?fittings.slice().reverse():fittings.slice();
    const shoulderOrdered=state.measurementDirection==="rtl"?shoulders.slice().reverse():shoulders.slice();
    const manualOrdered=state.measurementDirection==="rtl"?manuals.slice().reverse():manuals.slice();
    if(state.measurementDirection==="rtl") [leftOuter,rightOuter]=[rightOuter,leftOuter];

    if(leftOuter) raw.push(leftOuter);
    if(fitOrdered.length) raw.push(fitOrdered.shift());
    if(shoulderOrdered[0]) raw.push({type:"notch",notchIndex:shoulderOrdered[0].index,x:Number(shoulderOrdered[0].notch.x),y:Number(shoulderOrdered[0].notch.y)});
    if(extractorRun && !raw.includes(extractorRun)) raw.push(extractorRun);
    if(shoulderOrdered[1]) raw.push({type:"notch",notchIndex:shoulderOrdered[1].index,x:Number(shoulderOrdered[1].notch.x),y:Number(shoulderOrdered[1].notch.y)});
    manualOrdered.forEach(e=>raw.push({type:"notch",notchIndex:e.index,x:Number(e.notch.x),y:Number(e.notch.y)}));
    raw.push(...fitOrdered);
    if(rightOuter && rightOuter!==leftOuter && rightOuter!==extractorRun) raw.push(rightOuter);

    (state.manualHeightPoints||[]).forEach((pt,pointIndex)=>{
      if(!Number.isFinite(Number(pt.x)) || !Number.isFinite(Number(pt.y))) return;
      const feature={type:"measurement-point",pointIndex,measureId:pt._measureId||pointIndex,x:Number(pt.x),y:Number(pt.y)};
      let at=raw.length;
      if(state.measurementDirection==="rtl"){
        const j=raw.findIndex(f=>Number.isFinite(Number(f.x))&&Number(f.x)<feature.x);
        if(j>=0) at=j;
      }else{
        const j=raw.findIndex(f=>Number.isFinite(Number(f.x))&&Number(f.x)>feature.x);
        if(j>=0) at=j;
      }
      raw.splice(at,0,feature);
    });

    // Avoid accidental duplicates while preserving semantic order.
    const seen=new Set();
    const dedup=raw.filter(f=>{
      const id=f.type==="fitting"?`f${f.socketIndex}`:f.type==="notch"?`n${f.notchIndex}`:f.type==="measurement-point"?`p${f.measureId}`:`o${f.segmentIndex}`;
      if(seen.has(id)) return false; seen.add(id); return true;
    });
    return dedup.map((f,i)=>({...f,seq:i+1,key:heightFeatureKey(f)}));
  };

  const orderedMeasurementFeatures = () => widthMeasurementFeatureMap();

  // Alpha 6.0.4 — Benchmark 001 is a permanent regression fixture.
  // Never make the surveyor re-enter these values while the dimension engine is being developed.
  const seedBenchmark001Measurements = () => {
    const customer=String($("customerInput")?.value||"").trim();
    const counts=requiredMeasurementCounts();
    if(customer!=="Benchmark 001" || counts.widths!==10 || counts.heights!==10) return false;
    const hasWidths=(state.productionMeasurements?.stations||[]).some(r=>Number(r.value)>0);
    const hasHeights=(state.productionMeasurements?.heights||[]).some(r=>Number(r.value)>0);
    const hasOverall=Number(state.productionMeasurements?.overallWidth)>0;
    if(hasWidths || hasHeights || hasOverall) return false;
    const w=[243,595,623,1215,1237,2100,2110,2044,2170,2352];
    const h=[409,108,388,730,387,388,115,117,117,409];
    const wf=widthMeasurementFeatureMap();
    const hf=heightMeasurementFeatureMap();
    state.productionMeasurements.stations=w.map((value,i)=>({key:wf[i]?.key||`legacy-w-${i+1}`,value}));
    state.productionMeasurements.heights=h.map((value,i)=>({key:hf[i]?.key||`legacy-h-${i+1}`,value}));
    state.productionMeasurements.overallWidth=2923;
    state.productionMeasurements.offSquareOverallWidth=2930;
    if($("prodOverallWidth")) $("prodOverallWidth").value="2923";
    if($("prodOffSquareOverallWidth")) $("prodOffSquareOverallWidth").value="2930";
    return true;
  };

  const renderMeasurementSequence = () => {
    seedBenchmark001Measurements();
    const host=$("measurementSequence");
    if(!host) return;
    const features=orderedMeasurementFeatures();
    state.productionMeasurements.stations=migrateSequentialRecords(state.productionMeasurements?.stations||[],features,"m",widthFeatureKey);
    const existing=new Map((state.productionMeasurements?.stations||[]).map(s=>[s.key,s.value]));
    host.innerHTML=features.map(feature=>`
      <div class="measure-sequence-row" data-key="${feature.key}">
        <div class="measure-seq-no">${feature.seq}</div>
        <div class="measure-seq-label">Width ${feature.seq}</div>
        <input class="measure-seq-input" data-station-key="${feature.key}" type="text"
               inputmode="decimal" autocomplete="off" value="${existing.get(feature.key)??""}" placeholder="mm">
      </div>`).join("");
    host.querySelectorAll(".measure-seq-input").forEach(input=>{
      input.addEventListener("input",()=>{
        const key=input.dataset.stationKey, value=Number(input.value);
        const stations=state.productionMeasurements.stations||[];
        const i=stations.findIndex(s=>s.key===key);
        const rec={key,value:Number.isFinite(value)&&value>0?value:null};
        if(i>=0) stations[i]=rec; else stations.push(rec);
        state.productionMeasurements.stations=stations;
      });
    });
  };

  const renderHeightMeasurementSequence = () => {
    seedBenchmark001Measurements();
    const host=$("heightMeasurementSequence");
    if(!host) return;
    const features=heightMeasurementFeatureMap();
    state.productionMeasurements.heights=migrateSequentialRecords(state.productionMeasurements?.heights||[],features,"h",heightFeatureKey);
    const existing=new Map((state.productionMeasurements?.heights||[]).map(h=>[h.key,h.value]));
    host.innerHTML=features.map(feature=>{
      const n=feature.seq,key=feature.key;
      return `<div class="measure-sequence-row">
        <div class="measure-seq-no">${n}</div>
        <div class="measure-seq-label">Height ${n}</div>
        <input class="height-seq-input" data-height-key="${key}" type="text"
          inputmode="decimal" autocomplete="off" value="${existing.get(key)??""}" placeholder="mm">
      </div>`;
    }).join("");

    host.querySelectorAll(".height-seq-input").forEach(input=>{
      input.addEventListener("input",()=>{
        const key=input.dataset.heightKey;
        const value=Number(input.value);
        const heights=state.productionMeasurements.heights||[];
        const i=heights.findIndex(h=>h.key===key);
        const rec={key,value:Number.isFinite(value)&&value>0?value:null};
        if(i>=0) heights[i]=rec; else heights.push(rec);
        state.productionMeasurements.heights=heights;
      });
    });

    updateMeasurementCountBadge();
    renderAdvancedGeometryControls();
  };

  const stationMap = () => new Map(
    (state.productionMeasurements?.stations||[])
      .filter(s=>Number(s.value)>0)
      .map(s=>[s.key,Number(s.value)])
  );

  // Alpha 5.4.0: values are resolved by their feature key, never by incidental
  // array insertion order. This keeps W2-W4 and H5+ attached to the feature
  // the surveyor actually entered them against.
  const valuesByFeatureKey = (records, features) => {
    const map=new Map((records||[]).map(item=>[item.key,Number(item.value)]));
    return (features||[]).map(feature=>map.get(feature.key));
  };

  const appliedWidthFeatureValues = () => {
    const W=Number(state.productionMeasurements?.overallWidth);
    if(!(W>0)) return [];
    const features=widthMeasurementFeatureMap();
    const values=valuesByFeatureKey(state.productionMeasurements?.stations||[],features);
    if(values.length!==features.length || values.some(v=>!(v>0))) return [];

    // Alpha 5.5.2: NEVER sort entered values independently of their feature keys.
    // Each numbered width stays bound to the feature it was entered against.
    return features.map((feature,i)=>{
      const fromDatum=values[i];
      const physicalX=state.measurementDirection==="rtl" ? W-fromDatum : fromDatum;
      return {...feature,value:fromDatum,physicalX};
    });
  };

  const appliedHeightFeatureValues = () => {
    const features=heightMeasurementFeatureMap();
    const values=valuesByFeatureKey(state.productionMeasurements?.heights||[],features);
    if(values.length!==features.length || values.some(v=>!(v>0))) return [];
    return features.map((feature,i)=>({...feature,value:values[i]}));
  };

  const measuredNotchMetrics = (side) => {
    const widthFeatures=appliedWidthFeatureValues()
      .filter(f=>f.type==="notch-edge" && f.side===side);
    const heightFeature=appliedHeightFeatureValues()
      .find(f=>f.type==="notch" && autoShoulderNotchInfo().some(info=>info.index===f.notchIndex && info.side===side));
    const shoulderRun=appliedHeightFeatureValues()
      .filter(f=>f.type==="outline-y")
      .sort((a,b)=>a.x-b.x);

    if(widthFeatures.length<2) return null;
    const xs=widthFeatures.map(f=>f.physicalX).sort((a,b)=>a-b);
    const width=Math.abs(xs[1]-xs[0]);

    let shoulderHeight=null;
    if(shoulderRun.length){
      shoulderHeight=side==="left" ? shoulderRun[0].value : shoulderRun[shoulderRun.length-1].value;
    }
    const depth=(shoulderHeight>0 && heightFeature?.value>0)
      ? Math.max(0,shoulderHeight-heightFeature.value)
      : null;

    return {
      leftX:xs[0],
      rightX:xs[1],
      width,
      bottomHeight:heightFeature?.value||null,
      shoulderHeight,
      depth
    };
  };

  const measuredOutlineVertices = () => {
    const W=Number(state.productionMeasurements?.overallWidth);
    const widths=(state.productionMeasurements?.stations||[]).map(s=>Number(s.value));
    const heights=(state.productionMeasurements?.heights||[]).map(h=>Number(h.value));

    if(!(W>0) || widths.some(v=>!(v>0)) || heights.some(v=>!(v>0))) return null;

    // For the current detected full-hob-wall topology the numbered site sequence is:
    // W1 fitting edge
    // W2 left notch outer edge
    // W3 left notch inner edge / extractor left
    // W4 right notch inner edge / extractor right
    // W5 right notch outer edge
    // W6..W8 fitting edges
    //
    // H1 left shoulder, H2 fitting, H3 left notch bottom,
    // H4 extractor top, H5 right notch bottom,
    // H6..H8 fittings, H9 right shoulder.
    //
    // This is deliberately measurement-driven. The photo only decides WHAT topology
    // exists and therefore how many measurements are requested.
    const counts=requiredMeasurementCounts();
    if(counts.widths===8 && counts.heights===9 && widths.length===8 && heights.length===9){
      const x = widths.slice();
      if(state.measurementDirection==="rtl"){
        // Convert cumulative right-datum stations back to physical left-origin x.
        for(let i=0;i<x.length;i++) x[i]=W-x[i];
        x.sort((a,b)=>a-b);
      }

      const leftShoulder=heights[0];
      const leftNotchBottom=heights[2];
      const extractorTop=heights[3];
      const rightNotchBottom=heights[4];
      const rightShoulder=heights[8];

      // Exact production perimeter, clockwise from bottom-left.
      // Two independent U-notches are retained exactly as on the approved hand sketch.
      return [
        {x:0,    y:0},
        {x:W,    y:0},
        {x:W,    y:rightShoulder},
        {x:x[4], y:rightShoulder},
        {x:x[4], y:rightNotchBottom},
        {x:x[3], y:rightNotchBottom},
        {x:x[3], y:extractorTop},
        {x:x[2], y:extractorTop},
        {x:x[2], y:leftNotchBottom},
        {x:x[1], y:leftNotchBottom},
        {x:x[1], y:leftShoulder},
        {x:0,    y:leftShoulder}
      ];
    }

    // Extended full-hob mapper: retain the approved shoulder geometry when one
    // or more additional manual notches add extra width/height measurements.
    const outlineRuns=appliedHeightFeatureValues()
      .filter(feature=>feature.type==="outline-y")
      .sort((a,b)=>Number(a.x)-Number(b.x));
    const leftMetric=measuredNotchMetrics("left");
    const rightMetric=measuredNotchMetrics("right");
    if((state.points||[]).length===8 && outlineRuns.length>=3 && leftMetric && rightMetric){
      const leftShoulder=Number(outlineRuns[0].value);
      const rightShoulder=Number(outlineRuns[outlineRuns.length-1].value);
      const extractorTop=Math.max(...outlineRuns.map(run=>Number(run.value)));
      let perimeter=[
        {x:0,y:0},{x:W,y:0},{x:W,y:rightShoulder},
        {x:rightMetric.rightX,y:rightShoulder},
        {x:rightMetric.rightX,y:rightMetric.bottomHeight},
        {x:rightMetric.leftX,y:rightMetric.bottomHeight},
        {x:rightMetric.leftX,y:extractorTop},
        {x:leftMetric.rightX,y:extractorTop},
        {x:leftMetric.rightX,y:leftMetric.bottomHeight},
        {x:leftMetric.leftX,y:leftMetric.bottomHeight},
        {x:leftMetric.leftX,y:leftShoulder},{x:0,y:leftShoulder}
      ];

      const autoIndexes=new Set(autoShoulderNotchInfo().map(info=>info.index));
      const widthFeatures=appliedWidthFeatureValues();
      const heightFeatures=appliedHeightFeatureValues();
      (state.notches||[]).forEach((notch,notchIndex)=>{
        if(autoIndexes.has(notchIndex)) return;
        const edges=widthFeatures
          .filter(feature=>feature.type==="notch-edge" && feature.notchIndex===notchIndex)
          .map(feature=>Number(feature.physicalX)).sort((a,b)=>a-b);
        const bottom=Number(heightFeatures.find(feature=>feature.type==="notch" && feature.notchIndex===notchIndex)?.value);
        if(edges.length<2 || !(bottom>0)) return;
        const [x1,x2]=edges;
        const expanded=[];
        for(let i=0;i<perimeter.length;i++){
          const a=perimeter[i], b=perimeter[(i+1)%perimeter.length];
          expanded.push(a);
          const onHorizontal=Math.abs(a.y-b.y)<0.001;
          const within=x1>=Math.min(a.x,b.x)-0.001 && x2<=Math.max(a.x,b.x)+0.001;
          if(onHorizontal && within && a.y>bottom){
            if(a.x>b.x){
              expanded.push({x:x2,y:a.y},{x:x2,y:bottom},{x:x1,y:bottom},{x:x1,y:a.y});
            }else{
              expanded.push({x:x1,y:a.y},{x:x1,y:bottom},{x:x2,y:bottom},{x:x2,y:a.y});
            }
          }
        }
        perimeter=expanded;
      });
      return perimeter;
    }

    // Other splashbacks: keep the edited photo topology until its detected feature
    // sequence has a dedicated production mapper. Never invent dimensions.
    return null;
  };

  const measuredSocketOverride = (socket,index,vertices) => {
    const W=Number(state.productionMeasurements?.overallWidth);
    const widths=(state.productionMeasurements?.stations||[]).map(s=>Number(s.value));
    const heights=(state.productionMeasurements?.heights||[]).map(h=>Number(h.value));
    if(!(W>0) || widths.some(v=>!(v>0)) || heights.some(v=>!(v>0))) return null;

    const semanticWidth=appliedWidthFeatureValues().find(feature=>
      feature.type==="fitting" && feature.socketIndex===index
    );
    const semanticHeight=appliedHeightFeatureValues().find(feature=>
      feature.type==="fitting" && feature.socketIndex===index
    );
    if(semanticWidth && semanticHeight){
      const size=fittingFaceplateSize(socket);
      const isVertical=socket.type==="cooker" || socket.orientation==="vertical";
      const faceW=isVertical?Math.min(size.width,size.height):size.width;
      const faceH=isVertical?Math.max(size.width,size.height):size.height;
      const centreX=state.measurementDirection==="rtl"
        ? Number(semanticWidth.physicalX)-faceW/2
        : Number(semanticWidth.physicalX)+faceW/2;
      const candidate={x:centreX,y:Number(semanticHeight.value)+faceH/2};
      const inside=vertices?.length>=3 && vertices.reduce((hit,a,i)=>{
        const b=vertices[(i+vertices.length-1)%vertices.length];
        const crosses=((a.y>candidate.y)!==(b.y>candidate.y)) &&
          candidate.x<((b.x-a.x)*(candidate.y-a.y))/((b.y-a.y)||1e-9)+a.x;
        return crosses?!hit:hit;
      },false);
      // A measurement-sequence mismatch must never draw a fitting floating outside
      // the glass. Fall back to its locked photo-relative location instead.
      if(inside) return candidate;
      return null;
    }

    const counts=requiredMeasurementCounts();
    if(counts.widths!==8 || counts.heights!==9 || widths.length!==8 || heights.length!==9) return null;

    // Fittings in physical left-to-right order correspond to width stations
    // 1, 6, 7, 8 and height stations 2, 6, 7, 8.
    const sockets=(state.sockets||[])
      .map((s,i)=>({s,i}))
      .sort((a,b)=>Number(a.s.x)-Number(b.s.x));
    const rank=sockets.findIndex(item=>item.i===index);
    const widthSlots=[0,5,6,7];
    const heightSlots=[1,5,6,7];
    if(rank<0 || rank>=widthSlots.length) return null;

    let firstEdge=widths[widthSlots[rank]];
    if(state.measurementDirection==="rtl") firstEdge=W-firstEdge;

    const size=fittingFaceplateSize(socket);
    const isVertical=socket.type==="cooker" || socket.orientation==="vertical";
    const faceW=isVertical ? Math.min(size.width,size.height) : size.width;
    const faceH=isVertical ? Math.max(size.width,size.height) : size.height;

    const centreX=state.measurementDirection==="rtl"
      ? firstEdge-faceW/2
      : firstEdge+faceW/2;
    const centreY=heights[heightSlots[rank]]+faceH/2;

    return {x:centreX,y:centreY};
  };


  const renderAdvancedGeometryControls = () => {
    const count=requiredMeasurementCounts().widths;
    const from=$('offSquareFromStation'), to=$('offSquareToStation'), corner=$('radiusCornerSelect');
    const fillSelect=(el,max,label)=>{
      if(!el) return;
      const old=el.value;
      el.innerHTML='';
      for(let i=1;i<=max;i++){
        const opt=document.createElement('option'); opt.value=String(i); opt.textContent=`${label} ${i}`; el.appendChild(opt);
      }
      if([...el.options].some(o=>o.value===old)) el.value=old;
    };
    fillSelect(from,count,'Width'); fillSelect(to,count,'Width'); fillSelect(corner,(state.points||[]).length,'Corner');
    if(from && !from.value && count) from.value='1';
    if(to && count>1 && (!to.value || to.value===from?.value)) to.value='2';

    const sectionList=$('offSquareSectionList');
    if(sectionList){
      sectionList.innerHTML=(state.offSquareHeightSections||[]).map((r,i)=>
        `<div class="advanced-item"><strong>${r.direction==='rtl'?'R→L':'L→R'} W${r.from}–W${r.to}</strong><span>${Math.round(r.startHeight)} → ${Math.round(r.endHeight)} mm</span><button type="button" data-remove-offsquare="${i}">×</button></div>`
      ).join('') || '<div class="help">No off-square height sections added.</div>';
      sectionList.querySelectorAll('[data-remove-offsquare]').forEach(btn=>btn.addEventListener('click',()=>{
        state.offSquareHeightSections.splice(Number(btn.dataset.removeOffsquare),1); renderAdvancedGeometryControls(); persistWorkingJob(); generateDrawing();
      }));
    }
    const radiusList=$('cornerRadiusList');
    if(radiusList){
      const rows=Object.entries(state.cornerRadii||{}).filter(([,v])=>Number(v)>0).sort((a,b)=>Number(a[0])-Number(b[0]));
      radiusList.innerHTML=rows.map(([idx,r])=>
        `<div class="advanced-item"><strong>Corner ${Number(idx)+1}</strong><span>R${Math.round(Number(r))} mm</span><button type="button" data-remove-radius="${idx}">×</button></div>`
      ).join('') || '<div class="help">No corner radii added.</div>';
      radiusList.querySelectorAll('[data-remove-radius]').forEach(btn=>btn.addEventListener('click',()=>{
        delete state.cornerRadii[btn.dataset.removeRadius]; renderAdvancedGeometryControls(); persistWorkingJob(); generateDrawing();
      }));
    }
  };

  const addOffSquareHeightSection = () => {
    const from=Number($('offSquareFromStation')?.value), to=Number($('offSquareToStation')?.value);
    const startHeight=Number($('offSquareStartHeight')?.value), endHeight=Number($('offSquareEndHeight')?.value);
    if(!(from>0&&to>0&&from!==to&&startHeight>0&&endHeight>0)){
      setStatus($('productionMeasurementStatus'),'Choose two different width stations and enter both end heights.',false); return;
    }
    const direction=state.measurementDirection||'ltr';
    const rec={from,to,startHeight,endHeight,direction};
    const key=r=>`${r.direction}:${Math.min(r.from,r.to)}:${Math.max(r.from,r.to)}`;
    const i=(state.offSquareHeightSections||[]).findIndex(r=>key(r)===key(rec));
    if(i>=0) state.offSquareHeightSections[i]=rec; else state.offSquareHeightSections.push(rec);
    renderAdvancedGeometryControls(); persistWorkingJob(); generateDrawing();
    setStatus($('productionMeasurementStatus'),`Off-square height W${from}–W${to} saved.`,true);
  };

  const addCornerRadius = () => {
    const corner=Number($('radiusCornerSelect')?.value)-1, radius=Number($('cornerRadiusInput')?.value);
    if(!(corner>=0 && corner<(state.points||[]).length && radius>0)){
      setStatus($('productionMeasurementStatus'),'Choose a corner and enter a radius in mm.',false); return;
    }
    state.cornerRadii[String(corner)]=radius;
    renderAdvancedGeometryControls(); persistWorkingJob(); generateDrawing();
    setStatus($('productionMeasurementStatus'),`Corner ${corner+1} set to R${Math.round(radius)} mm.`,true);
  };

  const applyProductionMeasurements = () => {
    // Alpha 5.2.9 FIX: site/measured drawing is the immutable reference.
    // Production values are stored separately and must never rewrite the measured geometry.
    if(!state.measuredDrawingSnapshot){
      state.measuredDrawingSnapshot={
        stations:(state.productionMeasurements?.stations||[]).map(s=>({...s})),
        heights:(state.productionMeasurements?.heights||[]).map(h=>({...h})),
        overallWidth:state.productionMeasurements?.overallWidth ?? null
      };
    }
    state.productionModificationsApplied=false;
    state.productionSocketSizes=[];
    state.measurementDirection=document.querySelector('input[name="measureDirection"]:checked')?.value||"ltr";

    const counts=requiredMeasurementCounts();

    // Alpha 5.5.2: cumulative widths MUST progress away from the datum.
    // Read the survey values, then bind the ascending cumulative values to the
    // physical left-to-right/right-to-left feature sequence. This prevents a
    // late-entered station (for example 2044) being left behind 2100/2110.
    // Alpha 5.5.2: NEVER sort the survey widths. Measurement 1 stays 1,
    // Measurement 2 stays 2, etc. The user's sequence is authoritative.
    // Numeric sorting was the cause of width stations jumping to the wrong feature.
    const enteredWidthValues=[...document.querySelectorAll(".measure-seq-input")]
      .map(input=>Number(input.value)>0?Number(input.value):null);
    const currentWidthFeatures=widthMeasurementFeatureMap();
    state.productionMeasurements.stations=currentWidthFeatures.map((feature,i)=>({
      key:feature.key,
      value:enteredWidthValues[i]??null
    }));

    state.productionMeasurements.overallWidth=readPositiveMeasurement("prodOverallWidth");
    state.productionMeasurements.offSquareOverallWidth=readPositiveMeasurement("prodOffSquareOverallWidth");

    state.productionMeasurements.heights=[...document.querySelectorAll(".height-seq-input")].map(input=>({
      key:input.dataset.heightKey,
      value:Number(input.value)>0?Number(input.value):null
    }));

    const widthsComplete=
      state.productionMeasurements.stations.length===counts.widths &&
      state.productionMeasurements.stations.every(s=>Number(s.value)>0);

    const heightsComplete=
      state.productionMeasurements.heights.length===counts.heights &&
      state.productionMeasurements.heights.every(h=>Number(h.value)>0);

    const overallComplete=Number(state.productionMeasurements.overallWidth)>0;
    const complete=widthsComplete && heightsComplete && overallComplete;

    if(!complete){
      const missing=[];
      if(!widthsComplete) missing.push(`${counts.widths} width measurements`);
      if(!overallComplete) missing.push("overall width");
      if(!heightsComplete) missing.push(`${counts.heights} height measurements`);
      setStatus(
        $("productionMeasurementStatus"),
        `Still needed: ${missing.join(" · ")}.`,
        false
      );
      return;
    }

    state.productionMeasurements.detectedCounts={
      widths:counts.widths,
      heights:counts.heights
    };

    persistWorkingJob();
    setStatus(
      $("productionMeasurementStatus"),
      `APPLIED ✓ ${counts.widths} widths + overall width + ${counts.heights} heights saved.`,
      true
    );

    const button=$("applyProductionMeasurementsButton");
    if(button){
      const oldText=button.textContent;
      button.textContent="Measurements applied ✓";
      button.classList.add("measurements-applied");
      setTimeout(()=>{
        button.textContent=oldText;
        button.classList.remove("measurements-applied");
      },1800);
    }

    generateDrawing();
  };


  const applyMeasurementModificationsForProduction = () => {
    const counts=requiredMeasurementCounts();
    const measuredWidths=valuesByFeatureKey(state.productionMeasurements?.stations||[],widthMeasurementFeatureMap());
    const measuredHeights=valuesByFeatureKey(state.productionMeasurements?.heights||[],heightMeasurementFeatureMap());
    const measuredOverall=Number(state.productionMeasurements?.overallWidth);
    const measuredOffSquare=Number(state.productionMeasurements?.offSquareOverallWidth);

    const complete=
      measuredWidths.length===counts.widths && measuredWidths.every(v=>v>0) &&
      measuredHeights.length===counts.heights && measuredHeights.every(v=>v>0) &&
      measuredOverall>0;

    if(!complete){
      setStatus($("productionMeasurementStatus"),"Apply the measured site values first.",false);
      return;
    }

    try{
      state.productionSocketSizes=(state.sockets||[]).map((socket,index)=>{
        const spec=cutoutSpec(socket);
        const w=Number(socket.editWidth)>0?Number(socket.editWidth):spec.width;
        const h=Number(socket.editHeight)>0?Number(socket.editHeight):spec.height;
        const standard=["single","switch","double","cooker","multiple"].includes(socket.type||"double");
        return {
          index:index+1,type:socket.type||"double",
          measuredWidth:w,measuredHeight:h,
          productionWidth:Math.max(1,w-(standard?10:0)),
          productionHeight:Math.max(1,h-(standard?10:0))
        };
      });

      // Alpha 6.0.8: production values are derived from feature semantics for every topology.
      // Measured/site values remain untouched.
      const widthFeatures=widthMeasurementFeatureMap();
      const heightFeatures=heightMeasurementFeatureMap();
      let productionWidths=measuredWidths.slice();
      let productionHeights=measuredHeights.slice();

      // Fitting faceplate edge -> cut-out edge moves 5 mm inward from the datum.
      widthFeatures.forEach((feature,i)=>{
        if(feature?.type==="fitting" && state.sockets?.[feature.socketIndex]?.type!=="hole") productionWidths[i]=measuredWidths[i]+5;
      });
      // Notches receive 3 mm clearance on each side: datum-near edge -3, far edge +3.
      const notchGroups=new Map();
      widthFeatures.forEach((feature,i)=>{
        if(feature?.type!=="notch-edge") return;
        const key=String(feature.notchIndex); if(!notchGroups.has(key)) notchGroups.set(key,[]);
        notchGroups.get(key).push(i);
      });
      notchGroups.forEach(indices=>{
        indices.sort((a,b)=>measuredWidths[a]-measuredWidths[b]);
        if(indices[0]!=null) productionWidths[indices[0]]=measuredWidths[indices[0]]-3;
        if(indices[1]!=null) productionWidths[indices[1]]=measuredWidths[indices[1]]+3;
      });

      heightFeatures.forEach((feature,i)=>{
        if(feature?.type==="fitting" && state.sockets?.[feature.socketIndex]?.type!=="hole") productionHeights[i]=measuredHeights[i]+5;
        else if(feature?.type==="notch") productionHeights[i]=Math.max(1,measuredHeights[i]-3);
        else if(feature?.type==="outline-y" || feature?.type==="outer") productionHeights[i]=Math.max(1,measuredHeights[i]-3);
      });

      // Floor-drop / worktop-return profile. This topology has three cumulative
      // width stations plus the overall width, and four height stations. The
      // first RTL width finishes on the worktop and therefore comes back 5 mm;
      // the two internal returns gain 3 mm. Height allowances follow the two
      // opposing internal returns while the floor and overall height stay fixed.
      const floorDropProfile=
        state.measurementDirection==="rtl" &&
        widthFeatures.length===3 && heightFeatures.length===4 &&
        (state.points||[]).length>=8;
      if(floorDropProfile){
        productionWidths=[
          measuredWidths[0]-5,
          measuredWidths[1]+3,
          measuredWidths[2]+3
        ];
        productionHeights=[
          measuredHeights[0]-3,
          measuredHeights[1],
          measuredHeights[2]+3,
          measuredHeights[3]
        ];
      }

      state.productionAdjustedMeasurements={
        widths:productionWidths,
        heights:productionHeights,
        overallWidth:measuredOverall-(floorDropProfile?3:4),
        offSquareOverallWidth:(Number.isFinite(measuredOffSquare)&&measuredOffSquare>0)?measuredOffSquare-(floorDropProfile?3:4):null
      };

      state.productionModificationsApplied=true;
      generateDrawing();

      const button=$("applyMeasurementModificationsButton");
      if(button){
        button.disabled=false;
        button.textContent="Production modifications applied ✓";
        button.classList.add("production-applied");
      }
      const results=$("productionResults");
      if(results){
        results.innerHTML="<strong>Production measurements applied</strong>Red = measured edge-to-edge. Blue = production.";
        results.hidden=false;
      }
      setStatus($("productionMeasurementStatus"),
        `PRODUCTION ✓ Red = measured edge-to-edge. Blue = production after ${floorDropProfile?"floor-drop/worktop":"standard"} tolerances.`,true);
    }catch(err){
      console.error(err);
      state.productionModificationsApplied=false;
      state.productionSocketSizes=[];
      state.productionAdjustedMeasurements={widths:[],heights:[],overallWidth:null,offSquareOverallWidth:null};
      const button=$("applyMeasurementModificationsButton");
      if(button){button.disabled=false;button.textContent="Apply measurement modifications for production";}
      const results=$("productionResults"); if(results) results.hidden=true;
      setStatus($("productionMeasurementStatus"),"Production calculation failed. Measured drawing unchanged.",false);
    }
  };

  const revertToMeasuredValues = () => {
    state.productionModificationsApplied=false;
    state.productionAdjustedMeasurements={widths:[],heights:[],overallWidth:null,offSquareOverallWidth:null};
    const button=$("applyMeasurementModificationsButton");
    if(button){
      button.textContent="Apply measurement modifications for production";
      button.disabled=false;
      button.classList.remove("production-applied");
    }
    const canvas=$("drawingCanvas");
    if(canvas) delete canvas.dataset.productionMode;
    persistWorkingJob();
    generateDrawing();
    setStatus($("productionMeasurementStatus"),
      "Reverted to measured values. Production modifications are off.",true);
  };

  const renderDrawing = (mode = "measured") => {
    const previousDrawing = drawing;
    const previousCtx = drawingCtx;
    const target = mode === "production" ? $("productionDrawingCanvas") : $("drawingCanvas");
    if (target) { drawing = target; drawingCtx = target.getContext("2d"); }
    const productionOnly = mode === "production";
    // Lowest occupied dimension row below the glass. Socket callouts use this
    // boundary so they never collide with site-height or overall dimensions.
    let lowerDrawingContentY = 0;
    // Alpha 5.4.0: measured and production are rendered as separate drawings at the same display size.

    clearDrawing();

    // Keep the production sheet blank until production tolerances are actually applied.
    if(productionOnly && !state.productionModificationsApplied){
      drawingCtx.save();
      drawingCtx.fillStyle="#64748b";
      drawingCtx.font="700 22px -apple-system, sans-serif";
      drawingCtx.textAlign="center";
      drawingCtx.fillText("Apply production modifications to generate production drawing", drawing.width/2, drawing.height/2);
      drawingCtx.restore();
      const prodStatus=$("productionDrawingStatus");
      if(prodStatus) setStatus(prodStatus,"Apply production modifications to generate production values.",false);
      drawing = previousDrawing; drawingCtx = previousCtx;
      return;
    }
    // The scan supplies topology. Once every site measurement is present, the
    // measured drawing must use those real dimensions for its physical geometry.
    const scannedVertices = scaledPoints();
    const enteredVertices = measuredOutlineVertices();
    const vertices = enteredVertices?.length>=3 ? enteredVertices : scannedVertices;

    if (vertices.length < 3) {
      setStatus($("drawingStatus"), "Select at least three corners first.");
      return;
    }

    const xs = vertices.map((point) => point.x);
    const ys = vertices.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const scale = Math.min(
      900 / (maxX - minX || 1),
      550 / (maxY - minY || 1)
    );
    const initialOffsetX = 100 + (900 - (maxX - minX) * scale) / 2;
    // Extra top margin is reserved for the hand-drawing cumulative width dimensions.
    const drawingMeasurementCounts=requiredMeasurementCounts();
    const hasAppliedMeasurements=
      Number(state.productionMeasurements?.overallWidth)>0 &&
      (state.productionMeasurements?.stations||[]).length===drawingMeasurementCounts.widths &&
      (state.productionMeasurements?.stations||[]).every(item=>Number(item.value)>0) &&
      (state.productionMeasurements?.heights||[]).length===drawingMeasurementCounts.heights &&
      (state.productionMeasurements?.heights||[]).every(item=>Number(item.value)>0);
    const dimensionTopReserve = hasAppliedMeasurements ? 285 : 95;
    const usableDrawingHeight = hasAppliedMeasurements ? 360 : 550;
    const dimensionScale = Math.min(
      900 / (maxX - minX || 1),
      usableDrawingHeight / (maxY - minY || 1)
    );
    const effectiveScale = hasAppliedMeasurements ? dimensionScale : scale;
    const offsetY = dimensionTopReserve + (usableDrawingHeight - (maxY - minY) * effectiveScale) / 2;

    const offsetX = 100 + (900 - (maxX - minX) * effectiveScale) / 2;

    const map = (point) => ({
      x: offsetX + (point.x - minX) * effectiveScale,
      y: offsetY + (maxY - point.y) * effectiveScale
    });

    // Manufacturing perimeter.
    drawingCtx.beginPath();

    const p = vertices.map(map);
    drawingCtx.moveTo(p[0].x, p[0].y);

    const usingMeasuredProductionPerimeter = Boolean(enteredVertices?.length>=3);
    if(usingMeasuredProductionPerimeter){
      for(let i=1;i<p.length;i++) drawingCtx.lineTo(p[i].x,p[i].y);
      drawingCtx.closePath();
      // Always set the measured perimeter colour explicitly. Without this, the
      // narrow shoulder-notch segments can inherit the previous green datum style.
      drawingCtx.fillStyle = "#ffffff";
      drawingCtx.strokeStyle = productionOnly ? "#2563eb" : "#b91c1c";
      drawingCtx.lineWidth = 4;
    }

    else {
    // 1 -> 2 -> 3
    drawingCtx.lineTo(p[1].x, p[1].y);
    drawingCtx.lineTo(p[2].x, p[2].y);

    if (state.shoulderNotchesEnabled && vertices.length >= 8) {
      // RIGHT SHOULDER NOTCH at point 4 (index 3).
      // Travel left along shoulder from point 3, stop before point 4,
      // drop into glass, move to point-4 x, rise back to shoulder,
      // then continue vertically up the extractor side.
      const notchW = 18;
      const notchD = 16;

      const rightShoulderY = p[3].y;
      const rightApproachX = p[3].x + notchW;

      drawingCtx.lineTo(rightApproachX, rightShoulderY);
      drawingCtx.lineTo(rightApproachX, rightShoulderY + notchD);
      drawingCtx.lineTo(p[3].x, rightShoulderY + notchD);
      drawingCtx.lineTo(p[3].x, rightShoulderY);
    } else {
      drawingCtx.lineTo(p[3].x, p[3].y);
    }

    // 4 -> 5 -> 6
    drawingCtx.lineTo(p[4].x, p[4].y);
    drawingCtx.lineTo(p[5].x, p[5].y);

    if (state.shoulderNotchesEnabled && vertices.length >= 8) {
      // LEFT SHOULDER NOTCH at point 7 (index 6).
      // Travel down extractor side to point 7, drop into glass,
      // move left, rise to shoulder, then continue left to point 8.
      const notchW = 18;
      const notchD = 16;

      const leftShoulderY = p[6].y;

      drawingCtx.lineTo(p[6].x, leftShoulderY);
      drawingCtx.lineTo(p[6].x, leftShoulderY + notchD);
      drawingCtx.lineTo(p[6].x - notchW, leftShoulderY + notchD);
      drawingCtx.lineTo(p[6].x - notchW, leftShoulderY);
    } else {
      drawingCtx.lineTo(p[6].x, p[6].y);
    }

    // 7 -> 8 -> 1
    drawingCtx.lineTo(p[7].x, p[7].y);
    if (state.closed) drawingCtx.closePath();

    if (state.closed) {
      drawingCtx.fillStyle = "#dbeafe";
      drawingCtx.fill();
    }

    drawingCtx.strokeStyle = "#0f172a";
    drawingCtx.lineWidth = 4;
    }

    drawingCtx.stroke();

    // Alpha 6.0.8 — optional real corner radii on measured/production drawings.
    // Radius is stored in mm against the locked outline vertex index.
    Object.entries(state.cornerRadii||{}).forEach(([idxRaw,rRaw])=>{
      const i=Number(idxRaw), r=Number(rRaw); if(!(r>0)||i<0||i>=vertices.length) return;
      const prev=vertices[(i-1+vertices.length)%vertices.length], cur=vertices[i], next=vertices[(i+1)%vertices.length];
      const v1={x:prev.x-cur.x,y:prev.y-cur.y}, v2={x:next.x-cur.x,y:next.y-cur.y};
      const l1=Math.hypot(v1.x,v1.y),l2=Math.hypot(v2.x,v2.y); if(l1<1||l2<1) return;
      const dot=(v1.x*v2.x+v1.y*v2.y)/(l1*l2); const ang=Math.acos(Math.max(-0.9999,Math.min(0.9999,dot)));
      const tangent=Math.min(r/Math.tan(ang/2),l1*.45,l2*.45); if(!(tangent>0)) return;
      const a={x:cur.x+v1.x/l1*tangent,y:cur.y+v1.y/l1*tangent};
      const b={x:cur.x+v2.x/l2*tangent,y:cur.y+v2.y/l2*tangent};
      const ma=map(a),mc=map(cur),mb=map(b);
      drawingCtx.save(); drawingCtx.strokeStyle='#ffffff'; drawingCtx.lineWidth=12; drawingCtx.lineJoin='round';
      drawingCtx.beginPath(); drawingCtx.moveTo(ma.x,ma.y); drawingCtx.lineTo(mc.x,mc.y); drawingCtx.lineTo(mb.x,mb.y); drawingCtx.stroke();
      const radiusColour=productionOnly?'#2563eb':'#b91c1c';
      drawingCtx.strokeStyle=radiusColour; drawingCtx.lineWidth=4;
      drawingCtx.beginPath(); drawingCtx.moveTo(ma.x,ma.y); drawingCtx.quadraticCurveTo(mc.x,mc.y,mb.x,mb.y); drawingCtx.stroke();

      // Radius call-out stays readable even when the true-scale arc is only a few pixels.
      const centreX=(ma.x+mb.x+mc.x)/3, centreY=(ma.y+mb.y+mc.y)/3;
      const dx=mc.x-centreX, dy=mc.y-centreY, dl=Math.hypot(dx,dy)||1;
      const labelX=mc.x+(dx/dl)*34, labelY=mc.y+(dy/dl)*34;
      drawingCtx.lineWidth=2;
      drawingCtx.beginPath(); drawingCtx.moveTo((ma.x+mb.x)/2,(ma.y+mb.y)/2); drawingCtx.lineTo(labelX,labelY); drawingCtx.stroke();
      const radiusLabel=`R${Math.round(r)}`;
      drawingCtx.font='800 13px -apple-system, sans-serif'; drawingCtx.textAlign='center'; drawingCtx.textBaseline='middle';
      const rw=drawingCtx.measureText(radiusLabel).width+10;
      drawingCtx.fillStyle='#ffffff'; drawingCtx.fillRect(labelX-rw/2,labelY-9,rw,18);
      drawingCtx.fillStyle=radiusColour; drawingCtx.fillText(radiusLabel,labelX,labelY);
      drawingCtx.restore();
    });


    vertices.forEach((vertex, index) => {
      const current = map(vertex);
      const nextVertex = vertices[(index + 1) % vertices.length];
      const next = map(nextVertex);
      const length = Math.hypot(nextVertex.x - vertex.x, nextVertex.y - vertex.y);

      // Alpha 5.2.9: manufacturing drawing is kept clean.
      // Blue edit points remain on the PHOTO editor only.

      // For measured production geometry, dimensions are shown by the dedicated
      // hand-drawing dimension layer below. Keep legacy edge lengths only before
      // production measurements have been applied.
      if (!usingMeasuredProductionPerimeter) {
        drawingCtx.font = "12px -apple-system, sans-serif";
        drawingCtx.textAlign = "center";
        drawingCtx.fillText(
          `${Math.round(length)} mm`,
          (current.x + next.x) / 2,
          (current.y + next.y) / 2 - 7
        );
        drawingCtx.textAlign = "start";
      }
    });

    // ALPHA 5.2.9 — HAND-DRAWING DIMENSION LAYER
    // Presentation only. It does NOT alter the locked Alpha 5.1.5 production geometry.
    const measuredPerimeterForDimensions = hasAppliedMeasurements;
    if (measuredPerimeterForDimensions) {
      const W = Number(productionOnly && state.productionModificationsApplied ? state.productionAdjustedMeasurements?.overallWidth : state.productionMeasurements?.overallWidth);
      const widthFeaturesForValues=widthMeasurementFeatureMap();
      const heightFeaturesForValues=heightMeasurementFeatureMap();
      const measuredWidthsRaw = valuesByFeatureKey(state.productionMeasurements?.stations || [], widthFeaturesForValues);
      const measuredHeightsRaw = valuesByFeatureKey(state.productionMeasurements?.heights || [], heightFeaturesForValues);
      const widths = productionOnly && state.productionModificationsApplied
        ? (state.productionAdjustedMeasurements?.widths || measuredWidthsRaw)
        : measuredWidthsRaw;
      const heights = productionOnly && state.productionModificationsApplied ? (state.productionAdjustedMeasurements?.heights || measuredHeightsRaw) : measuredHeightsRaw;
      const counts = requiredMeasurementCounts();

      if (W > 0 &&
          widths.length === counts.widths &&
          heights.length === counts.heights &&
          widths.every(v => v > 0) &&
          heights.every(v => v > 0)) {

        // Dimension coordinates use the entered measurement system while the
        // perimeter itself stays locked to the scan. This maps stations onto the
        // fixed drawing without changing a single outline vertex.
        const enteredMaxHeight=Math.max(...heights,1);
        const drawingWidthPx=(maxX-minX)*effectiveScale;
        const drawingHeightPx=(maxY-minY)*effectiveScale;
        const measurementMap=point=>({
          x:offsetX+(Number(point.x)/W)*drawingWidthPx,
          y:offsetY+drawingHeightPx-(Number(point.y)/enteredMaxHeight)*drawingHeightPx
        });

        // Alpha 6.0.8 — measured feature geometry overlay.
        // The scan stays locked; notches and optional off-square runs are redrawn at the entered dimensions.
        const geometryColour=productionOnly?'#2563eb':'#0f172a';
        const eraseAndDrawNotch=(x1,x2,topHeight,bottomHeight)=>{
          if(![x1,x2,topHeight,bottomHeight].every(Number.isFinite) || x2<=x1 || topHeight<=bottomHeight) return;
          const a=measurementMap({x:x1,y:topHeight}), b=measurementMap({x:x2,y:topHeight});
          const d1=measurementMap({x:x1,y:bottomHeight}), d2=measurementMap({x:x2,y:bottomHeight});
          drawingCtx.save();
          drawingCtx.strokeStyle='#f8fafc'; drawingCtx.lineWidth=9; drawingCtx.lineJoin='miter';
          drawingCtx.beginPath(); drawingCtx.moveTo(a.x,a.y); drawingCtx.lineTo(d1.x,d1.y); drawingCtx.lineTo(d2.x,d2.y); drawingCtx.lineTo(b.x,b.y); drawingCtx.stroke();
          drawingCtx.strokeStyle=geometryColour; drawingCtx.lineWidth=3;
          drawingCtx.beginPath(); drawingCtx.moveTo(a.x,a.y); drawingCtx.lineTo(d1.x,d1.y); drawingCtx.lineTo(d2.x,d2.y); drawingCtx.lineTo(b.x,b.y); drawingCtx.stroke();
          drawingCtx.restore();
        };
        const geomWidthFeatures=widthMeasurementFeatureMap();
        const geomHeightFeatures=heightMeasurementFeatureMap();
        const geomWidths=productionOnly&&state.productionModificationsApplied?(state.productionAdjustedMeasurements?.widths||widths):widths;
        const geomHeights=productionOnly&&state.productionModificationsApplied?(state.productionAdjustedMeasurements?.heights||heights):heights;
        const geomByKey=new Map(geomWidthFeatures.map((f,i)=>[f.key,Number(geomWidths[i])]));
        const hGeomByKey=new Map(geomHeightFeatures.map((f,i)=>[f.key,Number(geomHeights[i])]));
        const notchTopHeight=(notchIndex)=>{
          const hFeature=geomHeightFeatures.find(f=>f.type==='notch'&&f.notchIndex===notchIndex);
          const bottom=hFeature?Number(hGeomByKey.get(hFeature.key)):NaN;
          const q=map(scaledNotch(state.notches[notchIndex]));
          // nearest visible horizontal run above the notch supplies the local top edge height.
          let best=null;
          for(let vi=0;vi<p.length;vi++){
            const a=p[vi],b=p[(vi+1)%p.length];
            if(Math.abs(a.y-b.y)>2) continue;
            if(q.x>=Math.min(a.x,b.x)-2&&q.x<=Math.max(a.x,b.x)+2){ if(!best||Math.abs(a.y-q.y)<Math.abs(best.y-q.y)) best={y:a.y}; }
          }
          const top=best? enteredMaxHeight-((best.y-offsetY)/drawingHeightPx)*enteredMaxHeight : NaN;
          return {top,bottom};
        };
        measurementNotchEntries().forEach(entry=>{
          // Alpha 6.0.21: automatic shoulder notches are already exact vertices
          // of the measurement-driven perimeter. Redrawing them from the photo
          // creates a duplicate overlay; on the right shoulder its top finder can
          // select the extractor top and turn the U-bite into two tall lines.
          // Keep this overlay only for manual notches that are not perimeter-native.
          if(usingMeasuredProductionPerimeter && entry.notch?.shoulderAuto) return;
          const edges=geomWidthFeatures.filter(f=>f.type==='notch-edge'&&f.notchIndex===entry.index)
            .map(f=>Number(geomByKey.get(f.key))).filter(v=>v>0).sort((a,b)=>a-b);
          if(edges.length<2) return;
          let x1=edges[0],x2=edges[1];
          if(state.measurementDirection==='rtl'){ x1=W-edges[1]; x2=W-edges[0]; }
          const hb=notchTopHeight(entry.index);
          eraseAndDrawNotch(x1,x2,hb.top,hb.bottom);
        });

        // Selected off-square sections become real sloped measured geometry between width stations.
        (state.offSquareHeightSections||[]).forEach(section=>{
          const aIdx=Number(section.from)-1,bIdx=Number(section.to)-1;
          const av=Number(widths[aIdx]),bv=Number(widths[bIdx]);
          if(!(av>0&&bv>0&&section.startHeight>0&&section.endHeight>0)) return;
          const secDir=section.direction||state.measurementDirection;
          const ax=secDir==='rtl'?W-av:av, bx=secDir==='rtl'?W-bv:bv;
          const pa=measurementMap({x:ax,y:Number(section.startHeight)}), pb=measurementMap({x:bx,y:Number(section.endHeight)});
          drawingCtx.save(); drawingCtx.strokeStyle=geometryColour; drawingCtx.lineWidth=4;
          drawingCtx.beginPath(); drawingCtx.moveTo(pa.x,pa.y); drawingCtx.lineTo(pb.x,pb.y); drawingCtx.stroke();
          drawingCtx.font='800 12px -apple-system, sans-serif'; drawingCtx.fillStyle=productionOnly?'#1d4ed8':'#991b1b'; drawingCtx.textAlign='center';
          drawingCtx.fillText(`OFF-SQUARE ${Math.round(section.startHeight)}→${Math.round(section.endHeight)} mm`,(pa.x+pb.x)/2,(pa.y+pb.y)/2-8); drawingCtx.restore();
        });
        const photoXs=(state.points||[]).map(point=>Number(point.x)).filter(Number.isFinite);
        const photoYs=(state.points||[]).map(point=>Number(point.y)).filter(Number.isFinite);
        const photoMinX=photoXs.length?Math.min(...photoXs):0;
        const photoMaxX=photoXs.length?Math.max(...photoXs):1;
        const photoMinY=photoYs.length?Math.min(...photoYs):0;
        const photoMaxY=photoYs.length?Math.max(...photoYs):1;
        const photoXToModel=x=>minX+((Number(x)-photoMinX)/(photoMaxX-photoMinX||1))*(maxX-minX);
        const photoYToModel=y=>maxY-((Number(y)-photoMinY)/(photoMaxY-photoMinY||1))*(maxY-minY);

        const physicalWidths = widths.map(v =>
          state.measurementDirection === "rtl" ? W - v : v
        );

        const dimLine = (x1,y1,x2,y2,label,labelX,labelY) => {
          drawingCtx.save();
          drawingCtx.strokeStyle = productionOnly ? "#2563eb" : "#b91c1c";
          drawingCtx.fillStyle = productionOnly ? "#1d4ed8" : "#991b1b";
          drawingCtx.lineWidth = 2;
          drawingCtx.beginPath();
          drawingCtx.moveTo(x1,y1);
          drawingCtx.lineTo(x2,y2);
          drawingCtx.stroke();

          // end ticks
          const tick=5;
          drawingCtx.beginPath();
          drawingCtx.moveTo(x1,y1-tick); drawingCtx.lineTo(x1,y1+tick);
          drawingCtx.moveTo(x2,y2-tick); drawingCtx.lineTo(x2,y2+tick);
          drawingCtx.stroke();

          drawingCtx.font = "800 15px -apple-system, sans-serif";
          drawingCtx.textAlign = "center";
          drawingCtx.textBaseline = "middle";
          const tw=drawingCtx.measureText(label).width+10;
          drawingCtx.fillStyle="#ffffff";
          drawingCtx.fillRect(labelX-tw/2,labelY-9,tw,18);
          drawingCtx.fillStyle=productionOnly ? "#1d4ed8" : "#991b1b";
          drawingCtx.fillText(label,labelX,labelY);
          drawingCtx.restore();
        };

        const extension = (x1,y1,x2,y2) => {
          drawingCtx.save();
          drawingCtx.strokeStyle="#94a3b8";
          drawingCtx.lineWidth=1;
          drawingCtx.setLineDash([3,3]);
          drawingCtx.beginPath();
          drawingCtx.moveTo(x1,y1);
          drawingCtx.lineTo(x2,y2);
          drawingCtx.stroke();
          drawingCtx.restore();
        };

        const bottomLeft=measurementMap({x:0,y:0});
        const bottomRight=measurementMap({x:W,y:0});
        const topY=Math.min(...p.map(q=>q.y));

        // Alpha 6.0.10 — the surveyor taps the actual top or bottom square corner.
        // The compact L marker is drawn inward from that selected physical vertex.
        const selectedSquare=Number.isInteger(Number(state.squareCornerIndex)) ? p[Number(state.squareCornerIndex)] : null;
        const squarePoint=selectedSquare || (state.measurementDirection==="rtl"?bottomRight:bottomLeft);
        const centreX=p.reduce((sum,q)=>sum+q.x,0)/p.length;
        const centreY=p.reduce((sum,q)=>sum+q.y,0)/p.length;
        const squareDirX=centreX>=squarePoint.x?1:-1;
        const squareDirY=centreY>=squarePoint.y?1:-1;
        const datumColour=productionOnly?"#2563eb":"#15803d";
        drawingCtx.save();
        drawingCtx.strokeStyle=datumColour; drawingCtx.fillStyle=datumColour; drawingCtx.lineWidth=3;
        const l=18, insideX=squarePoint.x+(squareDirX*5), insideY=squarePoint.y+(squareDirY*5);
        drawingCtx.beginPath();
        drawingCtx.moveTo(insideX+(squareDirX*l),insideY);
        drawingCtx.lineTo(insideX,insideY);
        drawingCtx.lineTo(insideX,insideY+(squareDirY*l));
        drawingCtx.stroke();

        drawingCtx.restore();

        // WIDTHS — Dimension Engine V2.
        // There are two independent truths:
        //   1) the survey row number/value (what the user typed), and
        //   2) the exact visible X-coordinate of a fitting/notch edge.
        // Pair them by PHYSICAL DISTANCE FROM DATUM, never by array index and never by photo scale.
        const datumX = state.measurementDirection === "rtl" ? bottomRight.x : bottomLeft.x;

        const widthAnchorCandidates=[];

        // One width station per fitting: the first faceplate edge encountered from the selected datum.
        (state.sockets||[]).forEach((socket,socketIndex)=>{
          const centre=map(scaledSocket(socket,vertices));
          const spec=cutoutSpec(socket);
          const measuredW=Number(socket.editWidth)>0?Number(socket.editWidth):spec.width;
          const measuredH=Number(socket.editHeight)>0?Number(socket.editHeight):spec.height;
          const vertical=socket.type!=="cooker" && socket.orientation==="vertical";
          const drawW=(vertical?measuredH:measuredW)*effectiveScale;
          const x=centre.x+(state.measurementDirection==="rtl"?drawW/2:-drawW/2);
          widthAnchorCandidates.push({x,kind:"fitting",socketIndex});
        });

        // Shoulder notches: use the SAME pixel geometry used to draw the locked shoulder bites.
        if(state.shoulderNotchesEnabled && p.length>=8){
          const notchW=18;
          // point 4 / index 3 bite occupies [p3.x, p3.x+18]
          widthAnchorCandidates.push({x:p[3].x,kind:"shoulder"},{x:p[3].x+notchW,kind:"shoulder"});
          // point 7 / index 6 bite occupies [p6.x-18, p6.x]
          widthAnchorCandidates.push({x:p[6].x-notchW,kind:"shoulder"},{x:p[6].x,kind:"shoulder"});
        }

        // Manual notch: same ±14 px edge positions used by the visible U-shaped bite.
        measurementNotchEntries().filter(entry=>!entry.notch?.shoulderAuto).forEach(entry=>{
          const q=map(scaledNotch(entry.notch));
          widthAnchorCandidates.push({x:q.x-14,kind:"manual-notch",notchIndex:entry.index});
          widthAnchorCandidates.push({x:q.x+14,kind:"manual-notch",notchIndex:entry.index});
        });

        // Alpha 6.0.8 — notch dimension leaders must terminate on the same
        // measurement-driven notch edges that were drawn above. Replace photo-derived
        // notch candidates with exact geometry X coordinates from the entered stations.
        const exactNotchXs=[];
        geomWidthFeatures.forEach((feature,i)=>{
          if(feature?.type!=="notch-edge") return;
          const v=Number(geomWidths[i]); if(!(v>0)) return;
          const physical=state.measurementDirection==="rtl" ? W-v : v;
          exactNotchXs.push({x:measurementMap({x:physical,y:0}).x,kind:"measured-notch"});
        });
        if(exactNotchXs.length){
          for(let i=widthAnchorCandidates.length-1;i>=0;i--){
            if(widthAnchorCandidates[i].kind==="shoulder" || widthAnchorCandidates[i].kind==="manual-notch") widthAnchorCandidates.splice(i,1);
          }
          widthAnchorCandidates.push(...exactNotchXs);
        }

        // De-duplicate nearly coincident candidates, then order from the selected datum.
        let anchors=widthAnchorCandidates
          .filter(a=>Number.isFinite(a.x))
          .sort((a,b)=>a.x-b.x)
          .filter((a,i,arr)=>i===0 || Math.abs(a.x-arr[i-1].x)>2);
        if(state.measurementDirection==="rtl") anchors=anchors.slice().reverse();

        // Alpha 6.0.8 — bind each width directly to its physical feature.
        // No distance-sorting/pairing: inserting a hole or notch renumbers the list
        // but existing values stay attached to their feature identity.
        const widthRows=geomWidthFeatures.map((feature,i)=>({seq:i+1,feature,value:Number(geomWidths[i])}));
        const outlineTopAtX=(x)=>{
          const hits=[];
          for(let i=0;i<p.length;i++){
            const a=p[i], b=p[(i+1)%p.length];
            const lo=Math.min(a.x,b.x)-1, hi=Math.max(a.x,b.x)+1;
            if(x<lo||x>hi) continue;
            if(Math.abs(b.x-a.x)<1){ hits.push(Math.min(a.y,b.y)); continue; }
            const t=(x-a.x)/(b.x-a.x);
            if(t>=0&&t<=1) hits.push(a.y+t*(b.y-a.y));
          }
          return hits.length?Math.min(...hits):topY;
        };
        const widthTargetForFeature=(feature,value)=>{
          if(feature.type==="notch-edge") {
            const physical=state.measurementDirection==="rtl" ? W-value : value;
            return measurementMap({x:physical,y:0}).x;
          }
          if(feature.type==="fitting") {
            const physical=state.measurementDirection==="rtl"?W-value:value;
            return measurementMap({x:physical,y:0}).x;
          }
          if(feature.type==="outline-x") {
            const a=p[feature.segmentIndex], b=p[(feature.segmentIndex+1)%p.length];
            return a&&b ? (a.x+b.x)/2 : null;
          }
          if(feature.type==="measurement-point") {
            const marker=state.manualWidthPoints?.[feature.pointIndex];
            const scaled=scaledMeasurementPoint(marker);
            const q=scaled?map(scaled):null;
            return q ? q.x : null;
          }
          return null;
        };
        widthRows.forEach((row) => {
          if(!(row.value>0)) return;
          const targetX=widthTargetForFeature(row.feature,row.value);
          if(!Number.isFinite(targetX)) return;
          const y=topY - 26 - ((row.seq-1)*24);
          // Width witnesses terminate at the top outline/feature. They must not
          // continue through the glass and look like an extra green cut line.
          extension(datumX,outlineTopAtX(datumX),datumX,y);
          extension(targetX,outlineTopAtX(targetX),targetX,y);
          dimLine(datumX,y,targetX,y,`${row.seq}  ${Math.round(row.value)} mm`,
                  (datumX+targetX)/2,y);
        });

        // Alpha 6.0.8: legacy off-square overall-width callout is intentionally not rendered.
        // Off-square is now represented as normal bottom-to-top height dimensions below.

        // HEIGHTS — Alpha 6.0.8 feature-bound rendering.
        // Every entered height is drawn at the feature it measures. Left/right outer
        // heights stay outside the drawing; all internal feature heights sit directly
        // under their fitting/notch/run.
        const hColour=productionOnly?"#2563eb":"#991b1b";
        const allPX=p.map(q=>q.x), allPY=p.map(q=>q.y);
        const glassLeft=Math.min(...allPX), glassRight=Math.max(...allPX);

        const fittingAnchor=(feature,h)=>{
          const socket=state.sockets?.[feature.socketIndex]; if(!socket) return null;
          const measuredCentre=measuredSocketOverride(socket,feature.socketIndex,vertices);
          const centre=map(measuredCentre||scaledSocket(socket,scannedVertices));
          const spec=cutoutSpec(socket);
          const measuredW=Number(socket.editWidth)>0?Number(socket.editWidth):spec.width;
          const measuredH=Number(socket.editHeight)>0?Number(socket.editHeight):spec.height;
          const vertical=socket.type!=="cooker" && socket.orientation==="vertical";
          const drawH=(vertical?measuredW:measuredH)*effectiveScale;
          return {x:centre.x,y:centre.y+drawH/2};
        };
        const notchAnchor=(feature,h)=>{
          const edges=geomWidthFeatures.filter(f=>f.type==="notch-edge"&&f.notchIndex===feature.notchIndex)
            .map(f=>Number(geomByKey.get(f.key))).filter(v=>v>0);
          let physicalX;
          if(edges.length>=2){
            const lo=Math.min(...edges), hi=Math.max(...edges);
            physicalX=state.measurementDirection==="rtl" ? W-((lo+hi)/2) : (lo+hi)/2;
          } else {
            const q=map(scaledNotch(state.notches[feature.notchIndex]));
            return {x:q.x,y:measurementMap({x:0,y:h}).y};
          }
          return measurementMap({x:physicalX,y:h});
        };
        const outlineAnchor=(feature,h)=>{
          if(feature.type==="measurement-point"){
            const marker=state.manualHeightPoints?.[feature.pointIndex];
            const scaled=scaledMeasurementPoint(marker);
            const q=scaled?map(scaled):null; if(!q) return null;
            return {x:q.x,y:measurementMap({x:0,y:h}).y};
          }
          // The extractor-top height belongs at the centre of the extractor run:
          // between the left inner shoulder and right inner shoulder. It must not
          // be attached to either notch edge.
          if(feature.type==="outline-y" && !feature.outerSide){
            const physicalWidths=appliedWidthFeatureValues();
            const leftInner=physicalWidths
              .filter(item=>item.type==="notch-edge"&&item.side==="left")
              .map(item=>Number(item.physicalX)).filter(Number.isFinite);
            const rightInner=physicalWidths
              .filter(item=>item.type==="notch-edge"&&item.side==="right")
              .map(item=>Number(item.physicalX)).filter(Number.isFinite);
            if(leftInner.length&&rightInner.length){
              const extractorLeft=Math.max(...leftInner);
              const extractorRight=Math.min(...rightInner);
              if(extractorRight>extractorLeft){
                return measurementMap({x:(extractorLeft+extractorRight)/2,y:h});
              }
            }
          }
          // Other measured runs bind to the closest measured station rather than
          // reusing a stale scanned-polygon segment index.
          const candidates=geomWidthFeatures.map((widthFeature,index)=>({
            distance:Math.abs(Number(widthFeature.x)-Number(feature.x)),
            value:Number(geomWidths[index])
          })).filter(item=>Number.isFinite(item.distance)&&item.value>0)
            .sort((a,b)=>a.distance-b.distance);
          if(candidates.length){
            const physical=state.measurementDirection==="rtl"?W-candidates[0].value:candidates[0].value;
            return measurementMap({x:physical,y:h});
          }
          const sourceXs=(state.points||[]).map(point=>Number(point.x)).filter(Number.isFinite);
          if(!sourceXs.length) return null;
          const sourceMin=Math.min(...sourceXs), sourceMax=Math.max(...sourceXs);
          const ratio=(Number(feature.x)-sourceMin)/(sourceMax-sourceMin||1);
          return measurementMap({x:Math.max(0,Math.min(W,W*ratio)),y:h});
        };

        const usedInternalLabelRows=[];
        let deepestHeightLabelY=bottomLeft.y;
        const chooseHeightLabelRow=(x,label)=>{
          drawingCtx.save();
          drawingCtx.font="900 13px -apple-system, sans-serif";
          const halfWidth=(drawingCtx.measureText(label).width/2)+9;
          drawingCtx.restore();
          for(let rowIndex=0;rowIndex<10;rowIndex++){
            const ranges=usedInternalLabelRows[rowIndex]||(usedInternalLabelRows[rowIndex]=[]);
            const left=x-halfWidth,right=x+halfWidth;
            if(ranges.every(range=>right<range.left-10||left>range.right+10)){
              ranges.push({left,right});
              const y=bottomLeft.y+28+(rowIndex*25);
              deepestHeightLabelY=Math.max(deepestHeightLabelY,y);
              return y;
            }
          }
          const y=bottomLeft.y+28+(usedInternalLabelRows.length*25);
          deepestHeightLabelY=Math.max(deepestHeightLabelY,y);
          return y;
        };

        geomHeightFeatures.forEach((feature,i)=>{
          const seq=i+1, h=Number(geomHeights[i]); if(!(h>0)) return;
          let anchor=feature.type==="fitting"?fittingAnchor(feature,h):feature.type==="notch"?notchAnchor(feature,h):outlineAnchor(feature,h);
          if(!anchor || !Number.isFinite(anchor.x)||!Number.isFinite(anchor.y)) return;
          drawingCtx.save(); drawingCtx.strokeStyle=hColour; drawingCtx.fillStyle=hColour; drawingCtx.lineWidth=1.6; drawingCtx.font="900 13px -apple-system, sans-serif";
          if(feature.type==="outline-y" && feature.outerSide){
            const visualLeft=feature.outerSide==="left";
            const x=visualLeft?glassLeft-28:glassRight+28;
            drawingCtx.beginPath(); drawingCtx.moveTo(x,bottomLeft.y); drawingCtx.lineTo(x,anchor.y); drawingCtx.stroke();
            drawingCtx.beginPath(); drawingCtx.moveTo(x-5,bottomLeft.y); drawingCtx.lineTo(x+5,bottomLeft.y); drawingCtx.moveTo(x-5,anchor.y); drawingCtx.lineTo(x+5,anchor.y); drawingCtx.stroke();
            drawingCtx.textAlign=visualLeft?"right":"left"; drawingCtx.textBaseline="middle";
            drawingCtx.fillText(`${seq}  ${Math.round(h)} mm`,x+(visualLeft?-8:8),(bottomLeft.y+anchor.y)/2);
          } else {
            const label=`${seq}  ${Math.round(h)} mm`;
            const row=chooseHeightLabelRow(anchor.x,label);
            drawingCtx.beginPath(); drawingCtx.moveTo(anchor.x,bottomLeft.y); drawingCtx.lineTo(anchor.x,anchor.y); drawingCtx.stroke();
            drawingCtx.beginPath(); drawingCtx.moveTo(anchor.x-5,bottomLeft.y); drawingCtx.lineTo(anchor.x+5,bottomLeft.y); drawingCtx.moveTo(anchor.x-5,anchor.y); drawingCtx.lineTo(anchor.x+5,anchor.y); drawingCtx.stroke();
            drawingCtx.textAlign="center"; drawingCtx.textBaseline="top"; drawingCtx.fillText(label,anchor.x,row);
          }
          drawingCtx.restore();
        });

        // The overall width comes after every internal height row. This keeps the
        // cumulative height labels readable even when several fittings are close.
        const overallY=Math.max(bottomLeft.y+105,deepestHeightLabelY+38);
        extension(bottomLeft.x,bottomLeft.y,bottomLeft.x,overallY);
        extension(bottomRight.x,bottomRight.y,bottomRight.x,overallY);
        dimLine(bottomLeft.x,overallY,bottomRight.x,overallY,
                `OVERALL  ${Math.round(W)} mm`,
                (bottomLeft.x+bottomRight.x)/2,overallY);
        lowerDrawingContentY=Math.max(lowerDrawingContentY,overallY);
      }
    }

    // Alpha 6.0.8 — no separate off-square height mode.
    // Different entered height values are already bound to their physical height anchors by Dimension Engine V2.
    // The drawing therefore follows the entered heights automatically.

    // Before notch measurements are entered, show every manual notch immediately
    // as an editable U-shaped bite on both drawings.
    if(!usingMeasuredProductionPerimeter && !hasAppliedMeasurements){
      (state.notches||[]).filter(notch=>!notch.shoulderAuto).forEach(notch=>{
        const notchPoint=map(scaledNotch(notch));
        const centreY=p.reduce((sum,point)=>sum+point.y,0)/(p.length||1);
        const depthDirection=centreY>=notchPoint.y?1:-1;
        const halfWidth=14;
        const depth=16*depthDirection;
        drawingCtx.save();
        drawingCtx.fillStyle="#f8fafc";
        drawingCtx.fillRect(notchPoint.x-halfWidth-3,Math.min(notchPoint.y,notchPoint.y+depth)-3,(halfWidth*2)+6,Math.abs(depth)+6);
        drawingCtx.strokeStyle=productionOnly?"#2563eb":"#b91c1c";
        drawingCtx.lineWidth=3;
        drawingCtx.beginPath();
        drawingCtx.moveTo(notchPoint.x-halfWidth,notchPoint.y);
        drawingCtx.lineTo(notchPoint.x-halfWidth,notchPoint.y+depth);
        drawingCtx.lineTo(notchPoint.x+halfWidth,notchPoint.y+depth);
        drawingCtx.lineTo(notchPoint.x+halfWidth,notchPoint.y);
        drawingCtx.stroke();
        drawingCtx.restore();
      });
    }

    const socketCallouts=[];
    state.sockets.forEach((socket, index) => {
      // After measurements are applied, fittings move to their measured edge and
      // height positions. Before that, the editable scan position remains visible.
      const scaled = measuredSocketOverride(socket,index,vertices) || scaledSocket(socket,scannedVertices);
      const mappedSocket = map(scaled);
      const x = mappedSocket.x;
      const y = mappedSocket.y;

      const spec = cutoutSpec(socket);
      const measuredW = Number(socket.editWidth) > 0 ? Number(socket.editWidth) : spec.width;
      const measuredH = Number(socket.editHeight) > 0 ? Number(socket.editHeight) : spec.height;
      // Alpha 5.2.9: measured socket rectangle NEVER changes in production mode.
      // Production cut-out sizes are annotation values only.
      const editW = measuredW;
      const editH = measuredH;

      // Faceplate preview sizes BEFORE measurement-stage allowances:
      // single 85x85, double 145x85, vertical cooker 85x145.
      // Cooker dimensions are already stored as 85 wide x 145 high.
      const useVertical = socket.type !== "cooker" && socket.orientation === "vertical";
      const drawWidth = (useVertical ? editH : editW) * effectiveScale;
      const drawHeight = (useVertical ? editW : editH) * effectiveScale;
      drawingCtx.fillStyle = "#fff";
      drawingCtx.strokeStyle = productionOnly ? "#2563eb" : "#dc2626";
      drawingCtx.lineWidth = 3;
      if(socket.type === "hole") {
        const r=Math.max(8,Math.min(16,drawWidth/2));
        drawingCtx.beginPath(); drawingCtx.moveTo(x-r,y); drawingCtx.lineTo(x+r,y); drawingCtx.moveTo(x,y-r); drawingCtx.lineTo(x,y+r); drawingCtx.stroke();
      } else {
        drawingCtx.fillRect(x - drawWidth / 2, y - drawHeight / 2, drawWidth, drawHeight);
        drawingCtx.strokeRect(x - drawWidth / 2, y - drawHeight / 2, drawWidth, drawHeight);
      }

      // Keep the fitting code inside the socket so the drawing maps directly to
      // its graphical schedule entry. Dimensions remain in the schedule only.
      drawingCtx.fillStyle = productionOnly ? "#1d4ed8" : "#991b1b";
      drawingCtx.font = "800 12px -apple-system, sans-serif";
      drawingCtx.textAlign = "center";
      drawingCtx.textBaseline = "middle";
      if(socket.type !== "hole") drawingCtx.fillText(`${spec.label} ${index + 1}`, x, y);

      const measured=fittingFaceplateSize(socket);
      const production=(state.productionSocketSizes||[])[index];
      const dimension=socket.type === "hole"
        ? `Ø${Math.round(measured.width)} mm`
        : (productionOnly && production
          ? `${Math.round(production.productionWidth)} × ${Math.round(production.productionHeight)} mm`
          : `${Math.round(measured.width)} × ${Math.round(measured.height)} mm`);
      socketCallouts.push({
        x,
        socketBottom:y+drawHeight/2,
        text:`${socket.type==="hole"?"HOLE":spec.label+" "+(index+1)} — ${dimension}`
      });

      drawingCtx.textBaseline = "alphabetic";
      drawingCtx.textAlign = "start";


    });

    // Socket information belongs to its drawing. Route each fitting to a clean,
    // automatically spaced callout below the glass instead of using a schedule box.
    {
      const glassLeft=Math.min(...p.map(point=>point.x));
      const glassRight=Math.max(...p.map(point=>point.x));
      const glassBottom=Math.max(...p.map(point=>point.y));
      const hasOffSquare=Number(state.productionMeasurements?.offSquareOverallWidth)>0;
      const selectedDatum=Number.isInteger(Number(state.squareCornerIndex)) ? p[Number(state.squareCornerIndex)] : null;
      const datumStartX=selectedDatum?.x ?? (state.offSquareSquareCorner==="right"?glassRight:glassLeft);
      const datumStartY=selectedDatum?.y ?? (glassBottom-3);
      const scheduleCallouts=[...((hasOffSquare||selectedDatum)?[{x:datumStartX,socketBottom:datumStartY,text:"90° DATUM",datum:true}]:[]),...socketCallouts];
      if(!scheduleCallouts.length) return;
      const rowGap=27;
      const colour="#15803d";

      // Alpha 6.0.8: every green leader drops STRAIGHT DOWN from its feature.
      // If labels would overlap, stagger them vertically rather than routing sideways.
      const placed=[];
      scheduleCallouts.slice().sort((a,b)=>a.x-b.x).forEach((callout,index)=>{
        let lane=0;
        while(placed.some(p=>Math.abs(p.x-callout.x)<150 && p.lane===lane)) lane++;
        placed.push({x:callout.x,lane});
        const targetX=callout.x;
        const calloutStartY=Math.max(glassBottom+145,lowerDrawingContentY+48);
        const targetY=calloutStartY+(lane*rowGap);

        drawingCtx.save();
        drawingCtx.strokeStyle="#22c55e";
        drawingCtx.lineWidth=1.4;
        drawingCtx.setLineDash([4,3]);
        drawingCtx.beginPath();
        drawingCtx.moveTo(callout.x,callout.socketBottom+3);
        drawingCtx.lineTo(callout.x,targetY-13);
        drawingCtx.stroke();
        drawingCtx.setLineDash([]);

        drawingCtx.font="800 13px -apple-system, sans-serif";
        drawingCtx.textAlign="center";
        drawingCtx.textBaseline="middle";
        const textWidth=drawingCtx.measureText(callout.text).width+12;
        drawingCtx.fillStyle="#ffffff";
        drawingCtx.fillRect(targetX-textWidth/2,targetY-10,textWidth,20);
        drawingCtx.fillStyle=colour;
        drawingCtx.fillText(callout.text,targetX,targetY);
        drawingCtx.restore();
      });
    }

    drawingCtx.fillStyle = "#172033";
    drawingCtx.font = "700 25px -apple-system, sans-serif";
    drawingCtx.textAlign = "center";
    drawingCtx.fillText(
      `${$("customerInput").value} · ${$("pieceInput").value}`,
      drawing.width / 2,
      930
    );

    drawingCtx.fillStyle = "#64748b";
    drawingCtx.font = "16px -apple-system, sans-serif";
    drawingCtx.fillText(
      `${Math.round(maxX - minX)} × ${Math.round(maxY - minY)} mm · ` +
      `${(polygonArea(vertices) / 1_000_000).toFixed(3)} m² · ` +
      `${(polygonPerimeter(vertices) / 1000).toFixed(3)} m perimeter`,
      drawing.width / 2,
      965
    );
    drawingCtx.textAlign = "start";

    if(mode === "measured") {
      setStatus($("drawingStatus"), state.closed ? "MEASURED VALUES DRAWING — applied site measurements." : "Drawing generated, but the outline is still open.", state.closed);
    } else {
      const prodStatus=$("productionDrawingStatus");
      if(prodStatus) setStatus(prodStatus, state.productionModificationsApplied ? "PRODUCTION DRAWING — tolerances applied." : "Apply production modifications to generate production values.", state.productionModificationsApplied);
    }
    drawing = previousDrawing; drawingCtx = previousCtx;
  };

  const generateDrawing = () => {
    renderDrawing("measured");
    renderDrawing("production");
  };

  const currentJobData = () => ({
    id: state.id,
    customer: $("customerInput").value.trim(),
    piece: $("pieceInput").value.trim(),
    width: Number($("widthInput").value) || 0,
    height: Number($("heightInput").value) || 0,
    points: state.points,
    manualWidthPoints: state.manualWidthPoints,
    manualHeightPoints: state.manualHeightPoints,
    sockets: state.sockets,
    notches: state.notches,
    offSquareHeightSections: state.offSquareHeightSections,
    squareCornerIndex: state.squareCornerIndex,
    cornerRadii: state.cornerRadii,
    closed: state.closed,
    calibrationPoints: state.calibrationPoints,
    mmPerPixel: state.mmPerPixel,
    photoDataUrl: state.photoDataUrl,
    calibrationPoints: state.calibrationPoints,
    mmPerPixel: state.mmPerPixel,
    updatedAt: new Date().toISOString()
  });

  const applyJobData = (job) => {
    state.id = job.id || crypto.randomUUID();
    state.points = Array.isArray(job.points) ? job.points : [];
    state.manualWidthPoints = Array.isArray(job.manualWidthPoints) ? job.manualWidthPoints : [];
    state.manualHeightPoints = Array.isArray(job.manualHeightPoints) ? job.manualHeightPoints : [];
    state.sockets = Array.isArray(job.sockets) ? job.sockets : [];
    state.notches = Array.isArray(job.notches) ? job.notches : [];
    state.offSquareHeightSections = Array.isArray(job.offSquareHeightSections) ? job.offSquareHeightSections : [];
    state.squareCornerIndex = Number.isInteger(Number(job.squareCornerIndex)) ? Number(job.squareCornerIndex) : null;
    state.cornerRadii = job.cornerRadii && typeof job.cornerRadii==='object' ? job.cornerRadii : {};
    state.closed = Boolean(job.closed);
    state.photoDataUrl = job.photoDataUrl || null;
    state.calibrationPoints = Array.isArray(job.calibrationPoints) ? job.calibrationPoints : [];
    state.mmPerPixel = Number(job.mmPerPixel) > 0 ? Number(job.mmPerPixel) : null;

    $("calibrationScaleOutput").value = state.mmPerPixel
      ? `${state.mmPerPixel.toFixed(4)} mm/pixel`
      : "Not calibrated";

    $("customerInput").value = job.customer || "";
    $("pieceInput").value = job.piece || "";
    $("widthInput").value = job.width || 2628;
    $("heightInput").value = job.height || 799;

    if (state.photoDataUrl) {
      photo.onload = () => requestAnimationFrame(resizeOverlay);
      photo.src = state.photoDataUrl;
    } else {
      photo.src = "/benchmark.jpg";
    }

    setMode(state.closed ? "move" : "add-width");
    requestAnimationFrame(() => {
      resizeOverlay();
      generateDrawing();
    });
  };

  const getSavedJobs = () => {
    try {
      return JSON.parse(localStorage.getItem("splashcad.jobs") || "[]");
    } catch {
      return [];
    }
  };

  const setSavedJobs = (jobs) => {
    localStorage.setItem("splashcad.jobs", JSON.stringify(jobs));
  };

  const renderSavedJobs = () => {
    const list = $("savedJobsList");
    list.innerHTML = "";
    const jobs = getSavedJobs();

    if (!jobs.length) {
      list.innerHTML = '<p class="help">No saved jobs yet.</p>';
      return;
    }

    jobs
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .forEach((job) => {
        const node = $("jobTemplate").content.cloneNode(true);
        node.querySelector(".job-title").textContent =
          job.customer || "Unnamed customer";
        node.querySelector(".job-meta").textContent =
          `${job.piece || "Unnamed piece"} · ${new Date(job.updatedAt).toLocaleString()}`;

        node.querySelector(".open-job").addEventListener("click", () => {
          applyJobData(job);
          window.scrollTo({ top: 0, behavior: "smooth" });
        });

        node.querySelector(".delete-job").addEventListener("click", () => {
          if (!confirm("Delete this saved job?")) return;
          setSavedJobs(getSavedJobs().filter((saved) => saved.id !== job.id));
          renderSavedJobs();
        });

        list.appendChild(node);
      });
  };

  const saveCurrentJob = () => {
    const job = currentJobData();
    const jobs = getSavedJobs();
    const index = jobs.findIndex((saved) => saved.id === job.id);

    if (index >= 0) jobs[index] = job;
    else jobs.push(job);

    setSavedJobs(jobs);
    renderSavedJobs();
    setStatus($("drawingStatus"), "Job saved on this device.", true);
  };

  const newJob = () => {
    state.id = crypto.randomUUID();
    state.points = [];
    state.manualWidthPoints = [];
    state.manualHeightPoints = [];
    state.sockets = [];
    state.notches = [];
    state.offSquareHeightSections = [];
    state.cornerRadii = {};
    state.closed = false;
    state.photoDataUrl = null;
    state.calibrationPoints = [];
    state.mmPerPixel = null;
    state.history = [];
    $("calibrationScaleOutput").value = "Not calibrated";
    setStatus($("calibrationStatus"), "No calibration points selected.");

    $("customerInput").value = "";
    $("pieceInput").value = "";
    $("widthInput").value = 2628;
    $("heightInput").value = 799;

    photo.src = "/benchmark.jpg";
    setMode("add-width");
    requestAnimationFrame(() => {
      resizeOverlay();
      clearDrawing();
      setStatus($("drawingStatus"), "No drawing generated yet.");
    });
  };



  [
    "prodOverallWidth","prodPoint8","prodPoint7","prodPoint4","prodPoint3",
    "prodLeftHeight","prodRightHeight","prodExtractorHeight"
  ].forEach((id) => $(id)?.addEventListener("input", updateMeasurementConfidence));


  $("prodOverallWidth")?.addEventListener("input",(event)=>{
    const value=Number(event.target.value);
    state.productionMeasurements.overallWidth=
      Number.isFinite(value)&&value>0 ? value : null;
  });

  $("prodOffSquareOverallWidth")?.addEventListener("change",(event)=>{
    const value=Number(event.target.value);
    state.productionMeasurements.offSquareOverallWidth=Number.isFinite(value)&&value>0?value:null;
    if(state.productionMeasurements.offSquareOverallWidth && !Number.isInteger(Number(state.squareCornerIndex))){
      setStatus($("photoStatus"),"Use Square corner in Editing tools, then tap the correct top or bottom corner.",false);
    }
    persistWorkingJob(); generateDrawing();
  });

  $("applyProductionMeasurementsButton").addEventListener("click", applyProductionMeasurements);
  $("applyMeasurementModificationsButton").addEventListener("click", applyMeasurementModificationsForProduction);
  $("revertMeasuredValuesButton").addEventListener("click", revertToMeasuredValues);
  $("addOffSquareSectionButton")?.addEventListener("click", addOffSquareHeightSection);

  $("clearProductionMeasurementsButton").addEventListener("click", () => {
    state.productionModificationsApplied=false;
    state.measuredVertices=null;
    state.productionMeasurements={
      overallWidth:null, offSquareOverallWidth:null, stations:[], heights:[]
    };
    state.offSquareHeightSections=[]; state.offSquareSquareCorner=null; state.squareCornerIndex=null; state.cornerRadii={}; renderAdvancedGeometryControls();
    document.querySelectorAll("#productionMeasurementPanel input").forEach(el=>{ if(el.type!=="radio") el.value=""; });
    renderMeasurementSequence();
    renderHeightMeasurementSequence();
    setStatus($("productionMeasurementStatus"),"Measurements cleared. Current photo and edited geometry are retained.",true);
    persistWorkingJob();
    generateDrawing();
  });

  document.querySelectorAll('input[name="measureDirection"]').forEach(radio => {
    radio.addEventListener("change", () => {
      state.measurementDirection = radio.value;
      renderMeasurementSequence();
      renderHeightMeasurementSequence();
      renderAdvancedGeometryControls();
    });
  });

  $("detectEdgesButton").addEventListener("click", detectEdges);
  $("detectFittingsButton").addEventListener("click", detectFittings);
  $("oneClickDetectButton").addEventListener("click", () => {
    if (!state.photoDataUrl) {
      $("libraryInput").click();
      setStatus($("edgeDetectionStatus"), "Choose the kitchen photo. Detection will be ready immediately afterwards.");
      return;
    }
    detectEdges();
  });
  $("saveDetectionRunButton").addEventListener("click", saveDetectionRun);
  $("localFallbackButton").addEventListener("click", () => {
    suggestLocalFallback();
    $("edgeConfidenceBadge").textContent = `${state.detectionConfidence}% local`;
    setStatus($("edgeDetectionStatus"), "Local fallback used. This is not AI detection and must be fully corrected by hand.");
  });
  $("acceptDetectedButton").addEventListener("click", () => {
    if (!state.points.length) {
      alert("Run edge detection first.");
      return;
    }
    state.detectedOutlinePending = false;
    setMode("move");
    setStatus($("edgeDetectionStatus"), "Detection accepted. Drag points to correct the outline, then verify real measurements.", true);
    updateMeasurementConfidence();
    renderMeasurementSequence();
    renderHeightMeasurementSequence();
    window.dispatchEvent(new CustomEvent("splashcad:measurements-ready", { detail: { wall: "hob" } }));
  });

  // Old verification-panel listeners removed in Alpha 5.2.9.
  // Production measurement controls have their own listeners below.

  $("addWidthModeButton")?.addEventListener("click", () => {
    setMode("add-width");
    setStatus($("photoStatus"),"Tap the outline edge. The new point will add one width measurement.",true);
  });
  $("addHeightModeButton")?.addEventListener("click", () => {
    setMode("add-height");
    setStatus($("photoStatus"),"Tap the outline edge. The new point will add one height measurement.",true);
  });
  $("squareCornerModeButton")?.addEventListener("click", () => {
    setMode("square-corner");
    setStatus($("photoStatus"),"Tap the exact top or bottom outline corner that must be square.",true);
  });
  $("moveModeButton").addEventListener("click", () => setMode("move"));
  const chooseCutout = (type) => {
    state.cutoutType = type;
    setMode("socket");
    setStatus($("photoStatus"), `Tap the centre position for the ${cutoutSpec({ type }).label.toLowerCase()} cut-out.`, true);
  };
  $("singleSocketModeButton").dataset.cutoutType = "single";
  $("socketModeButton").dataset.cutoutType = "double";
  $("cookerSwitchModeButton").dataset.cutoutType = "cooker";
  $("holeModeButton").dataset.cutoutType = "hole";
  $("singleSocketModeButton").addEventListener("click", () => chooseCutout("single"));
  $("socketModeButton").addEventListener("click", () => chooseCutout("double"));
  $("cookerSwitchModeButton").addEventListener("click", () => chooseCutout("cooker"));
  $("holeModeButton").addEventListener("click", () => {
    const i=state.selectedSocketIndex;
    if(i>=0 && state.sockets?.[i]?.type==="hole" && state.mode==="move") {
      const entered=window.prompt("Edit hole diameter Ø mm", String(Math.round(Number(state.sockets[i].editDiameter)||20)));
      if(entered===null) return;
      const d=Number(entered); if(!(d>0)){ alert("Enter a valid hole diameter in mm."); return; }
      pushHistory(); state.sockets[i].editDiameter=d; state.sockets[i].editWidth=d; state.sockets[i].editHeight=d;
      redrawOverlay(); renderMeasurementSequence(); renderHeightMeasurementSequence(); persistWorkingJob(); generateDrawing(); return;
    }
    chooseCutout("hole");
  });
  $("radiusModeButton")?.addEventListener("click",()=>{ setMode("radius"); setStatus($("photoStatus"),"Tap the corner to radius. Enter the radius in the popup.",true); });
  const applyShoulderNotches = () => {
    // Shoulder notches are the two lower corners of the extractor rise: points 7 and 4
    // in the approved 8-point survey order shown on the user's drawing.
    state.notches = state.notches.filter(n => !n.shoulderAuto);
    if (state.shoulderNotchesEnabled && state.points.length >= 8) {
      [6, 3].forEach(i => {
        const p = state.points[i];
        if (p) state.notches.push({ x: p.x, y: p.y, shoulderAuto: true });
      });
    }
    redrawOverlay();
    generateDrawing();
    renderMeasurementSequence();
    renderHeightMeasurementSequence();
  };
  $("shoulderNotchesButton").addEventListener("click", () => {
    pushHistory();
    state.shoulderNotchesEnabled = !state.shoulderNotchesEnabled;
    $("shoulderNotchesButton").textContent = `Shoulder notches: ${state.shoulderNotchesEnabled ? "Yes" : "No"}`;
    applyShoulderNotches();
    renderMeasurementSequence();
    renderHeightMeasurementSequence();
    setStatus($("photoStatus"), state.shoulderNotchesEnabled ? "Shoulder notches added at both extractor shoulders. Drawing shows the shoulder relief points; size/offset will be entered in Measurements. Add notch remains available elsewhere." : "Automatic shoulder notches removed. Manual notches are unchanged.", true);
  });


  const applySelectedFittingSize = () => {
    const i = state.selectedSocketIndex;
    if (i < 0 || !state.sockets[i]) {
      setStatus($("photoStatus"), "Select a socket/switch first.", false);
      return;
    }
    const w = Number($("fittingWidthInput").value);
    const h = Number($("fittingHeightInput").value);
    if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(h) || h <= 0) {
      setStatus($("photoStatus"), "Enter a valid fitting width and height.", false);
      return;
    }
    pushHistory();
    state.sockets[i].editWidth = w;
    state.sockets[i].editHeight = h;
    redrawOverlay();
    generateDrawing();
    setStatus($("photoStatus"), `Selected fitting size set to ${Math.round(w)} × ${Math.round(h)} mm.`, true);
  };

  $("applyFittingSizeButton").addEventListener("click", applySelectedFittingSize);

  $("standardFittingSizeButton").addEventListener("click", () => {
    const i = state.selectedSocketIndex;
    if (i < 0 || !state.sockets[i]) {
      setStatus($("photoStatus"), "Select a socket/switch first.", false);
      return;
    }
    const spec = cutoutSpec(state.sockets[i]);
    $("fittingWidthInput").value = Math.round(spec.width);
    $("fittingHeightInput").value = Math.round(spec.height);
    applySelectedFittingSize();
  });

  $("notchModeButton").addEventListener("click", () => {
    setMode("notch");
    setStatus($("photoStatus"), "Tap the glass edge where the notch is. Use Select / move to adjust it.", true);
  });
  $("eraseModeButton").addEventListener("click", () => setMode("erase"));
  $("calibrationModeButton").addEventListener("click", () => {
    state.calibrationPoints = [];
    state.mmPerPixel = null;
    $("calibrationScaleOutput").value = "Not calibrated";
    setStatus($("calibrationStatus"), "Select the first calibration point.");
    setMode("calibrate");
    redrawOverlay();
  });

  $("applyCalibrationButton").addEventListener("click", () => {
    if (state.calibrationPoints.length !== 2) {
      alert("Select exactly two calibration points first.");
      return;
    }

    const knownDistance = Number($("calibrationDistanceInput").value);
    if (!Number.isFinite(knownDistance) || knownDistance <= 0) {
      alert("Enter a valid known distance in millimetres.");
      return;
    }

    const [a, b] = state.calibrationPoints;
    const pixelDistance = Math.hypot(b.x - a.x, b.y - a.y);
    if (pixelDistance < 1) {
      alert("The calibration points are too close together.");
      return;
    }

    state.mmPerPixel = knownDistance / pixelDistance;
    $("calibrationScaleOutput").value = `${state.mmPerPixel.toFixed(4)} mm/pixel`;
    setStatus(
      $("calibrationStatus"),
      `Calibration applied: ${knownDistance.toFixed(1)} mm over ${pixelDistance.toFixed(1)} pixels.`,
      true
    );
    setMode(state.closed ? "move" : "add");
    redrawOverlay();
    if (state.points.length >= 3) generateDrawing();
  });

  $("clearCalibrationButton").addEventListener("click", () => {
    state.calibrationPoints = [];
    state.mmPerPixel = null;
    $("calibrationScaleOutput").value = "Not calibrated";
    setStatus($("calibrationStatus"), "No calibration points selected.");
    setMode(state.closed ? "move" : "add");
    redrawOverlay();
    if (state.points.length >= 3) generateDrawing();
  });



  $("finishOutlineButton").addEventListener("click", () => {
    if (state.points.length < 3) {
      alert("Select at least three corners first.");
      return;
    }
    pushHistory();
    state.closed = true;
    setMode("move");
    redrawOverlay();
    generateDrawing();
    renderMeasurementSequence();
    renderHeightMeasurementSequence();
    window.dispatchEvent(new CustomEvent("splashcad:measurements-ready", { detail: { wall: "hob" } }));
  });

  $("loadBenchmarkButton").addEventListener("click", () => {
    pushHistory();
    const rect = overlay.getBoundingClientRect();

    state.points = [
      { x: rect.width * 0.05, y: rect.height * 0.73 },
      { x: rect.width * 0.05, y: rect.height * 0.40 },
      { x: rect.width * 0.37, y: rect.height * 0.40 },
      { x: rect.width * 0.37, y: rect.height * 0.19 },
      { x: rect.width * 0.63, y: rect.height * 0.19 },
      { x: rect.width * 0.63, y: rect.height * 0.40 },
      { x: rect.width * 0.96, y: rect.height * 0.40 },
      { x: rect.width * 0.96, y: rect.height * 0.73 }
    ];
    state.manualWidthPoints=[];
    state.manualHeightPoints=[];

    state.sockets = [
      { x: rect.width * 0.19, y: rect.height * 0.59 },
      { x: rect.width * 0.81, y: rect.height * 0.59 }
    ];

    state.closed = true;
    setMode("move");
    redrawOverlay();
    generateDrawing();
    renderMeasurementSequence();
    renderHeightMeasurementSequence();
    window.dispatchEvent(new CustomEvent("splashcad:measurements-ready", { detail: { wall: "hob" } }));
  });

  $("undoButton").addEventListener("click", () => {
    const previous = state.history.pop();
    if (!previous) return;

    const geometry = JSON.parse(previous);
    state.points = geometry.points;
    state.manualWidthPoints = geometry.manualWidthPoints || [];
    state.manualHeightPoints = geometry.manualHeightPoints || [];
    state.sockets = geometry.sockets;
    state.notches = geometry.notches || [];
    state.offSquareHeightSections = geometry.offSquareHeightSections || [];
    state.squareCornerIndex = Number.isInteger(Number(geometry.squareCornerIndex)) ? Number(geometry.squareCornerIndex) : null;
    state.cornerRadii = geometry.cornerRadii || {};
    state.closed = geometry.closed;
    state.calibrationPoints = geometry.calibrationPoints || [];
    state.mmPerPixel = geometry.mmPerPixel || null;
    $("calibrationScaleOutput").value = state.mmPerPixel
      ? `${state.mmPerPixel.toFixed(4)} mm/pixel`
      : "Not calibrated";

    redrawOverlay();
    generateDrawing();
  });

  $("clearButton").addEventListener("click", () => {
    if (!confirm("Clear all points and sockets?")) return;
    pushHistory();
    state.points = [];
    state.manualWidthPoints = [];
    state.manualHeightPoints = [];
    state.sockets = [];
    state.squareCornerIndex = null;
    state.notches = [];
    state.closed = false;
    state.calibrationPoints = [];
    state.mmPerPixel = null;
    $("calibrationScaleOutput").value = "Not calibrated";
    setStatus($("calibrationStatus"), "No calibration points selected.");
    setMode("add-width");
    redrawOverlay();
    clearDrawing();
    setStatus($("drawingStatus"), "No drawing generated yet.");
  });

  $("libraryInput").addEventListener("change", (event) => {
    loadPhotoFile(event.target.files?.[0]);
  });

  $("cameraInput").addEventListener("change", (event) => {
    loadPhotoFile(event.target.files?.[0]);
  });

  $("generateButton").addEventListener("click", generateDrawing);
  $("exportDxfButton").addEventListener("click", exportDxf);
  $("savePdfButton").addEventListener("click", () => {
    generateDrawing();
    window.print();
  });
  $("saveJobButton").addEventListener("click", saveCurrentJob);
  $("newJobButton").addEventListener("click", newJob);

  $("exportJobButton").addEventListener("click", () => {
    const blob = new Blob(
      [JSON.stringify(currentJobData(), null, 2)],
      { type: "application/json" }
    );

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "SplashCAD-job.json";
    link.click();
    URL.revokeObjectURL(link.href);
  });

  $("importJobInput").addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        applyJobData(JSON.parse(String(reader.result)));
      } catch {
        alert("This job file could not be opened.");
      }
    };
    reader.readAsText(file);
  });

  ["customerInput", "pieceInput", "widthInput", "heightInput", "calibrationDistanceInput"].forEach((id) => {
    $(id).addEventListener("input", () => {
      state.updatedAt = new Date().toISOString();
      if (state.points.length >= 3) generateDrawing();
    });
  });

  photo.addEventListener("load", () => {
    requestAnimationFrame(resizeOverlay);
  });

  

  const measurementEntryInputs = () => [
    ...document.querySelectorAll(".measure-seq-input"),
    $("prodOverallWidth"),
    $("prodOffSquareOverallWidth"),
    ...document.querySelectorAll(".height-seq-input")
  ].filter(Boolean);

  const focusNextMeasurementEntry = (current) => {
    const fields=measurementEntryInputs();
    const i=fields.indexOf(current);
    if(i>=0 && i<fields.length-1){
      const next=fields[i+1];
      next.focus();
      next.select?.();
      next.scrollIntoView?.({block:"nearest",behavior:"smooth"});
      return;
    }
    const apply=$("applyProductionMeasurementsButton");
    if(apply){
      apply.focus();
      apply.scrollIntoView?.({block:"nearest",behavior:"smooth"});
    }
  };

  // One delegated handler survives dynamic rerenders of width/height boxes.
  document.addEventListener("keydown",(event)=>{
    const target=event.target;
    if(!target?.matches?.(".measure-seq-input, #prodOverallWidth, .height-seq-input")) return;
    if(event.key==="Enter"){
      event.preventDefault();
      focusNextMeasurementEntry(target);
    }
  });

  // Prevent trackpad/mouse-wheel gestures from ever changing survey values.
  document.addEventListener("wheel",(event)=>{
    const target=event.target;
    if(target?.matches?.(".measure-seq-input, #prodOverallWidth, .height-seq-input")){
      // Inputs are text fields in 5.1.7, so scrolling only scrolls the panel.
      // Do not preventDefault: users must still be able to scroll the measurement panel.
    }
  },{passive:true});

  const WORKING_DB="SplashCADWorkingJob";
  const WORKING_STORE="current";
  const openWorkingDB=()=>new Promise((resolve,reject)=>{
    const req=indexedDB.open(WORKING_DB,1);
    req.onupgradeneeded=()=>{ if(!req.result.objectStoreNames.contains(WORKING_STORE)) req.result.createObjectStore(WORKING_STORE); };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
  const persistWorkingJob=async()=>{
    if(!state?.imageSrc) return;
    try{
      const db=await openWorkingDB();
      const tx=db.transaction(WORKING_STORE,"readwrite");
      tx.objectStore(WORKING_STORE).put({
        imageSrc:state.imageSrc, points:state.points||[], manualWidthPoints:state.manualWidthPoints||[], manualHeightPoints:state.manualHeightPoints||[], sockets:state.sockets||[],
        notches:state.notches||[], shoulderNotches:!!state.shoulderNotches,
        offSquareHeightSections:[], offSquareSquareCorner:state.offSquareSquareCorner||null, squareCornerIndex:state.squareCornerIndex, cornerRadii:state.cornerRadii||{},
        measurementDirection:state.measurementDirection||"ltr",
        productionModificationsApplied:!!state.productionModificationsApplied,
        productionMeasurements:state.productionMeasurements||{}
      },"job");
    }catch(err){ console.warn("Working job cache failed",err); }
  };
  const restoreWorkingJob=async()=>{
    try{
      const db=await openWorkingDB();
      const saved=await new Promise((resolve,reject)=>{
        const req=db.transaction(WORKING_STORE,"readonly").objectStore(WORKING_STORE).get("job");
        req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
      });
      if(!saved?.imageSrc) return;
      state.imageSrc=saved.imageSrc; state.points=saved.points||[]; state.manualWidthPoints=saved.manualWidthPoints||[]; state.manualHeightPoints=saved.manualHeightPoints||[]; state.sockets=saved.sockets||[];
      state.notches=saved.notches||[]; state.shoulderNotches=!!saved.shoulderNotches;
      state.offSquareHeightSections=[]; state.offSquareSquareCorner=saved.offSquareSquareCorner||null;
      state.squareCornerIndex=Number.isInteger(Number(saved.squareCornerIndex))?Number(saved.squareCornerIndex):null;
      state.cornerRadii=saved.cornerRadii||{};
      state.measurementDirection=saved.measurementDirection||"ltr";
      state.productionModificationsApplied=!!saved.productionModificationsApplied;
      state.productionMeasurements={...state.productionMeasurements,...(saved.productionMeasurements||{})};
      const img=new Image();
      img.onload=()=>{
        state.image=img;
        const photo=$("photo"); if(photo) photo.src=saved.imageSrc;
        redrawOverlay(); renderMeasurementSequence(); renderHeightMeasurementSequence(); renderAdvancedGeometryControls(); generateDrawing();
      };
      img.src=saved.imageSrc;
    }catch(err){ console.warn("Working job restore failed",err); }
  };

window.addEventListener("resize", () => {
    requestAnimationFrame(resizeOverlay);
  });

  let deferredInstallPrompt = null;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    $("installButton").classList.remove("hidden");
  });

  $("installButton").addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    $("installButton").classList.add("hidden");
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  }

  clearDrawing();
  renderSavedJobs();
  renderMeasurementSequence();
    renderHeightMeasurementSequence();
  if (photo.complete) requestAnimationFrame(resizeOverlay);
})();

setTimeout(()=>{ restoreWorkingJob(); renderHeightMeasurementSequence(); },150);
setInterval(()=>{ if(state?.imageSrc) persistWorkingJob(); },10000);
