(() => {
  "use strict";

  const voiceStyle = document.createElement("style");
  voiceStyle.textContent = `.voice-command-panel{position:relative;z-index:20;margin:8px 0;padding:7px;border:1px solid #3b6458;border-radius:10px;background:#0a1713;color:#eaf6f2;font:700 11px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.voice-command-button{width:100%;min-height:36px;border:1px solid #35b690;border-radius:8px;background:linear-gradient(180deg,#22c799,#11946f);color:#fff;font:800 12px inherit;cursor:pointer}.voice-command-button[aria-pressed="true"]{background:linear-gradient(180deg,#ef4444,#b91c1c);border-color:#f87171}.voice-command-button:disabled{background:#33443e;border-color:#53655f}.voice-command-status{padding:6px 2px 0;color:#b8cbc4;line-height:1.25}.voice-command-status[data-kind="success"]{color:#6ee7b7}.voice-command-status[data-kind="error"]{color:#fca5a5}@media print{.voice-command-panel{display:none!important}}`;
  document.head.appendChild(voiceStyle);
  const panel = document.createElement("div");
  panel.className = "voice-command-panel";
  panel.innerHTML = `<button type="button" class="voice-command-button" aria-pressed="false">🎤 Voice measure</button><div class="voice-command-status">Voice measuring is optional.</div>`;
  const voiceHost=document.querySelector("#productionMeasurementPanel")||document.querySelector(".window-measurements .panel")||document.querySelector(".photo-edit-toolbar")||document.body;
  const hostTitle=voiceHost.querySelector?.(".panel-title,.measure-group-title");
  if(hostTitle)hostTitle.insertAdjacentElement("afterend",panel);else voiceHost.prepend(panel);
  const button = panel.querySelector("button");
  const status = panel.querySelector(".voice-command-status");
  let guidedActive = false;
  let speakingPrompt = false;
  let lastEnteredInput = null;
  let activeUtterance = null;
  let speechRun = 0;
  let listening = false;
  let connecting = false;
  let peer = null;
  let eventChannel = null;
  let microphoneStream = null;
  let microphoneTrack = null;

  const setStatus = (message, kind = "") => {
    status.textContent = message;
    status.dataset.kind = kind;
  };

  const visible = element => !!element && !element.disabled && element.offsetParent !== null;
  const editableInputs = () => [...document.querySelectorAll('input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]):not([type="file"]), select')]
    .filter(element => visible(element) && !element.readOnly);
  const guidedInputs = () => [...document.querySelectorAll('.measure-seq-input, #prodOverallWidth, .height-seq-input, #pieceInputs input[data-entry-order="width"], #pieceInputs input[data-entry-order="height"]')]
    .filter(element => visible(element) && !element.disabled && !element.readOnly);

  const measurementName = input => {
    const raw=input.closest(".piece-measurement-card")?.querySelector(".measure-piece-name")?.textContent?.replace(/\s+/g," ")?.trim();
    const piece=document.body.classList.contains("window-mode")?({"Panel left of window":"Left panel","Panel right of window":"Right panel","Panel below window":"Below window","Left reveal (optional)":"Left reveal","Right reveal (optional)":"Right reveal","Window cill (optional)":"Window cill"}[raw]||raw||"Window panel"):"Hob wall";
    if (input.id === "prodOverallWidth") return `${piece}. Overall width`;
    const sequenceLabel = input.closest(".measure-sequence-row")?.querySelector(".measure-seq-label")?.textContent?.trim();
    if (sequenceLabel) return `${piece}. ${sequenceLabel}`;
    const stationLabel = input.closest("label")?.querySelector(".measure-station-label")?.textContent?.replace(/\s+/g, " ")?.trim();
    if (stationLabel) return `${piece}. ${stationLabel.replace(/^\d+\s+/, "")}`;
    return `${piece}. ${input.dataset.entryOrder === "height" ? "Next height" : "Next width"}`;
  };

  const speak = (message, after) => {
    if (!("speechSynthesis" in window)) { after?.(); return; }
    const run = ++speechRun;
    window.speechSynthesis.cancel();
    speakingPrompt = true;
    if (microphoneTrack) microphoneTrack.enabled = false;
    activeUtterance = new SpeechSynthesisUtterance(message);
    activeUtterance.lang = "en-IE";
    activeUtterance.rate = 1.28;
    activeUtterance.pitch = 1.04;
    let finished = false;
    const finish = () => {
      if (finished || run !== speechRun) return;
      finished = true;
      speakingPrompt = false;
      activeUtterance = null;
      after?.();
      if (microphoneTrack && listening) microphoneTrack.enabled = true;
      if (listening) setStatus(`${shortMeasurementName(document.activeElement)} — listening now.`, "success");
    };
    activeUtterance.onend = activeUtterance.onerror = finish;
    window.speechSynthesis.speak(activeUtterance);
    setTimeout(finish, Math.max(900, message.length * 85));
  };

  const shortMeasurementName = input => {
    if (input.id === "prodOverallWidth") return "Overall width";
    const sequenceLabel = input.closest(".measure-sequence-row")?.querySelector(".measure-seq-label")?.textContent?.trim();
    if (sequenceLabel) return sequenceLabel;
    const stationLabel = input.closest("label")?.querySelector(".measure-station-label")?.textContent?.replace(/\s+/g, " ")?.trim();
    if (stationLabel) return stationLabel.replace(/^\d+\s+/, "");
    return input.dataset.entryOrder === "height" ? "Next height" : "Next width";
  };

  const askForInput = (input, confirmation = "", useShortName = false) => {
    if (!input) return;
    input.focus();
    input.select?.();
    input.scrollIntoView?.({ block: "center", behavior: "smooth" });
    const name = useShortName ? shortMeasurementName(input) : measurementName(input);
    setStatus(`${name}? Listening for the measurement.`);
    speak(`${confirmation ? `${confirmation}. ` : ""}${name}.`);
  };

  const finishGuide = () => {
    guidedActive = false;
    setStatus("All measurements have been requested. Check every value, then say apply measurements.", "success");
    speak("Measurements complete.");
  };

  const advanceGuide = (direction, confirmation = "") => {
    const active = document.activeElement;
    if (direction > 0 && active?.matches?.("input")) active.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    setTimeout(() => {
      let target = document.activeElement;
      let inputs = guidedInputs();
      if (!inputs.length) { finishGuide(); return; }
      if (!inputs.includes(target)) {
        const oldIndex = inputs.indexOf(active);
        target = direction < 0 ? inputs[Math.max(0, oldIndex - 1)] : inputs[Math.min(inputs.length - 1, Math.max(0, oldIndex + 1))];
        target?.focus();
      } else if (direction < 0) {
        const index = inputs.indexOf(target);
        target = inputs[Math.max(0, index - 1)];
        target?.focus();
      }
      inputs = guidedInputs();
      if (!target || !inputs.includes(target) || (direction > 0 && target === active && inputs.indexOf(target) === inputs.length - 1)) { finishGuide(); return; }
      askForInput(target, confirmation, direction > 0);
    }, 70);
  };

  const beginGuide = () => {
    const first = guidedInputs()[0];
    if (!first) { setStatus("No measurement boxes are available yet.", "error"); return; }
    guidedActive = true;
    if (!listening) startListening();
    setTimeout(() => askForInput(first), 250);
  };

  const moveFocus = direction => {
    const inputs = editableInputs();
    if (!inputs.length) return false;
    const active = document.activeElement;
    const index = inputs.indexOf(active);
    const target = inputs[Math.max(0, Math.min(inputs.length - 1, index < 0 ? 0 : index + direction))];
    target.focus();
    target.select?.();
    target.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    return true;
  };

  const clickVisible = ids => {
    for (const id of ids) {
      const element = document.getElementById(id);
      if (visible(element)) { element.click(); return true; }
    }
    return false;
  };

  const small = {zero:0,oh:0,one:1,two:2,to:2,too:2,three:3,four:4,for:4,five:5,six:6,seven:7,eight:8,ate:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19};
  const tens = {twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90};
  const integerWords = words => {
    if (words.length > 1 && words.every(word => Object.hasOwn(small, word) && small[word] < 10)) return Number(words.map(word => small[word]).join(""));
    if (words.length === 3 && Object.hasOwn(small, words[0]) && small[words[0]] > 0 && small[words[0]] < 10 && Object.hasOwn(tens, words[1]) && Object.hasOwn(small, words[2]) && small[words[2]] < 10) return small[words[0]] * 100 + tens[words[1]] + small[words[2]];
    if (words.length === 4 && Object.hasOwn(tens, words[0]) && Object.hasOwn(small, words[1]) && small[words[1]] < 10 && Object.hasOwn(tens, words[2]) && Object.hasOwn(small, words[3]) && small[words[3]] < 10) return (tens[words[0]] + small[words[1]]) * 100 + tens[words[2]] + small[words[3]];
    let total = 0, current = 0, used = false;
    for (const word of words) {
      if (word === "and") continue;
      if (Object.hasOwn(small, word)) { current += small[word]; used = true; continue; }
      if (Object.hasOwn(tens, word)) { current += tens[word]; used = true; continue; }
      if (word === "hundred") { current = Math.max(1, current) * 100; used = true; continue; }
      if (word === "thousand") { total += Math.max(1, current) * 1000; current = 0; used = true; continue; }
      return null;
    }
    return used ? total + current : null;
  };

  const spokenNumber = transcript => {
    const cleaned = transcript.toLowerCase().replace(/,/g, "").replace(/\b(millimetres?|millimeters?|mm|measurement|value|enter|is)\b/g, " ").replace(/-/g, " ").trim();
    const direct = cleaned.match(/-?\d+(?:\.\d+)?/);
    if (direct) return Number(direct[0]);
    const parts = cleaned.split(/\s+point\s+/);
    const whole = integerWords(parts[0].split(/\s+/).filter(Boolean));
    if (whole === null) return null;
    if (parts.length === 1) return whole;
    const decimalWords = parts[1].split(/\s+/).filter(Boolean);
    if (!decimalWords.length || !decimalWords.every(word => Object.hasOwn(small, word) && small[word] < 10)) return null;
    return Number(`${whole}.${decimalWords.map(word => small[word]).join("")}`);
  };

  const enterNumber = value => {
    const input = document.activeElement;
    if (!input?.matches?.('input:not([type="radio"]):not([type="checkbox"]):not([type="file"])') || input.readOnly || input.disabled) return false;
    input.value = String(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    return true;
  };

  const toolCommands = [
    [/^(select|select move|move)$/, ["moveButton", "moveModeButton"]],
    [/^(double socket|add double socket)$/, ["socketButton", "socketModeButton"]],
    [/^(single socket|add single socket)$/, ["singleSocketButton", "singleSocketModeButton"]],
    [/^(cooker switch|add cooker switch)$/, ["cookerButton", "cookerSwitchModeButton"]],
    [/^(add notch|notch)$/, ["notchButton", "notchModeButton"]],
    [/^(add hole|hole)$/, ["holeButton", "holeModeButton"]],
    [/^(corner radius|add radius|radius)$/, ["radiusButton", "radiusModeButton"]],
    [/^(90 corner|ninety corner|square corner)$/, ["squareButton", "squareCornerModeButton"]],
    [/^(view drawings|show drawings)$/, ["showDrawingsButton", "generateButton"]],
    [/^(back to photo|show photo)$/, ["backToPhotoButton"]]
  ];

  const handleCommand = raw => {
    const command = raw.toLowerCase().replace(/[.,!?]/g, "").replace(/\s+/g, " ").trim();
    if (!command) return;
    setStatus(`Heard: “${raw}”`);

    if (/^(stop|stop listening|voice off)$/.test(command)) { stopListening(); return; }
    if (/^(hob wall|open hob wall)$/.test(command)) { location.href = "/hob.html"; return; }
    if (/^(window wall|open window wall)$/.test(command)) { location.href = "/window.html"; return; }
    if (/^(wall selector|home|go home)$/.test(command)) { location.href = "/"; return; }
    if (/^(next|next measurement)$/.test(command)) {
      if (guidedActive) { advanceGuide(1); return; }
      const active = document.activeElement;
      if (active?.matches?.("input")) active.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      if (document.activeElement === active) moveFocus(1);
      setStatus("Moved to the next measurement.", "success"); return;
    }
    if (/^(back|go back|back again|previous|previous measurement)$/.test(command)) { if (guidedActive) advanceGuide(-1); else { moveFocus(-1); setStatus("Moved to the previous measurement.", "success"); } return; }
    if (/^(repeat|say again|repeat measurement|say that width again|say that height again)$/.test(command)) { const input=document.activeElement;if(input?.matches?.("input"))askForInput(input);return; }
    const correction = command.match(/^(?:correct that|change that|replace that|correction)\s+(.+)$/);
    if (correction) {
      const value = spokenNumber(correction[1]);
      if (value !== null && Number.isFinite(value) && lastEnteredInput && visible(lastEnteredInput)) {
        lastEnteredInput.value = String(value);
        lastEnteredInput.dispatchEvent(new Event("input", { bubbles: true }));
        const current = document.activeElement;
        setStatus(`Corrected to ${value} mm.`, "success");
        speak(`${value}. ${current?.matches?.("input") ? shortMeasurementName(current) : "Continue"}.`);
      } else setStatus("Say ‘correct that’ followed by the full measurement.", "error");
      return;
    }
    if (/^(start measurements|start guided measurements|ask measurements)$/.test(command)) { beginGuide(); return; }
    if (/^(clear value|clear measurement)$/.test(command)) {
      const input = document.activeElement;
      if (input?.matches?.("input") && !input.readOnly) { input.value = ""; input.dispatchEvent(new Event("input", { bubbles: true })); setStatus("Measurement cleared.", "success"); }
      return;
    }
    if (/^(apply measurements|apply measurement)$/.test(command)) {
      if (clickVisible(["applyButton", "applyProductionMeasurementsButton"])) setStatus("Measurements applied. Check the drawing before production.", "success");
      else setStatus("The Apply measurements button is not available here.", "error");
      return;
    }
    for (const [pattern, ids] of toolCommands) {
      if (pattern.test(command)) { const applied = clickVisible(ids); setStatus(applied ? `Command applied: ${raw}.` : `That tool is not available on this screen.`, applied ? "success" : "error"); return; }
    }
    const value = spokenNumber(command);
    if (value !== null && Number.isFinite(value)) {
      const measuredInput = document.activeElement;
      if (enterNumber(value)) {
        lastEnteredInput = measuredInput;
        if (guidedActive) {
          setStatus(`Entered ${value} mm. Moving on.`, "success");
          advanceGuide(1, String(value));
        } else setStatus(`Entered ${value} mm.`, "success");
      }
      else setStatus(`I heard ${value}, but no measurement box is selected. Click a box first.`, "error");
      return;
    }
    setStatus(`Command not recognised: “${raw}”.`, "error");
  };

  function closeRealtime() {
    try { eventChannel?.close(); } catch {}
    try { peer?.close(); } catch {}
    try { microphoneStream?.getTracks()?.forEach(track => track.stop()); } catch {}
    eventChannel = null;
    peer = null;
    microphoneStream = null;
    microphoneTrack = null;
  }

  async function startListening() {
    if (listening || connecting) return;
    if (!window.RTCPeerConnection || !navigator.mediaDevices?.getUserMedia) {
      setStatus("This browser cannot open a streaming microphone. Use Microsoft Edge.", "error");
      return;
    }
    connecting = true;
    button.disabled = true;
    button.textContent = "Connecting…";
    setStatus("Opening microphone…");
    try {
      microphoneStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }
      });
      microphoneTrack = microphoneStream.getAudioTracks()[0];
      if (!microphoneTrack) throw new Error("No microphone was found.");
      peer = new RTCPeerConnection();
      peer.addTrack(microphoneTrack, microphoneStream);
      eventChannel = peer.createDataChannel("oai-events");
      eventChannel.addEventListener("message", event => {
        let payload;
        try { payload = JSON.parse(event.data); } catch { return; }
        if (payload.type === "input_audio_buffer.speech_started" && !speakingPrompt) setStatus("Hearing you…", "success");
        if (payload.type === "conversation.item.input_audio_transcription.delta" && payload.delta && !speakingPrompt) setStatus(`Hearing: ${payload.delta}`);
        if (payload.type === "conversation.item.input_audio_transcription.completed" && payload.transcript && !speakingPrompt) handleCommand(payload.transcript);
        if (payload.type === "error") setStatus(payload.error?.message || "Streaming voice error.", "error");
      });
      let resolveOpened;
      let rejectOpened;
      const opened = new Promise((resolve, reject) => { resolveOpened = resolve; rejectOpened = reject; });
      eventChannel.addEventListener("open", () => resolveOpened(), { once: true });
      eventChannel.addEventListener("error", () => rejectOpened(new Error("The voice data channel could not open.")), { once: true });
      peer.addEventListener("connectionstatechange", () => {
        if (["failed", "closed"].includes(peer?.connectionState)) rejectOpened(new Error(`Voice network connection ${peer.connectionState}.`));
      });
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      if (peer.iceGatheringState !== "complete") {
        setStatus("Preparing voice network…");
        await new Promise(resolve => {
          const done = () => { clearTimeout(timer); peer.removeEventListener("icegatheringstatechange", changed); resolve(); };
          const changed = () => { if (peer.iceGatheringState === "complete") done(); };
          const timer = setTimeout(done, 6000);
          peer.addEventListener("icegatheringstatechange", changed);
        });
      }
      setStatus("Connecting live voice…");
      const response = await fetch("/api/realtime-session", {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: peer.localDescription.sdp
      });
      const answerBody = await response.text();
      if (!response.ok) {
        let message = `Voice connection failed (${response.status}).`;
        try { message = JSON.parse(answerBody)?.error || message; } catch {}
        throw new Error(message);
      }
      await peer.setRemoteDescription({ type: "answer", sdp: answerBody });
      await Promise.race([
        opened,
        new Promise((_, reject) => setTimeout(() => reject(new Error("The voice data channel timed out after the server connected.")), 18000))
      ]);
      listening = true;
      connecting = false;
      button.disabled = false;
      button.setAttribute("aria-pressed", "true");
      button.textContent = "⏹ Stop voice";
      setStatus("Streaming microphone connected.", "success");
      beginGuide();
    } catch (error) {
      connecting = false;
      listening = false;
      closeRealtime();
      button.disabled = false;
      button.setAttribute("aria-pressed", "false");
      button.textContent = "🎤 Voice measure";
      setStatus(error instanceof Error ? error.message : "Voice connection failed.", "error");
    }
  }

  function stopListening() {
    listening = false;
    connecting = false;
    guidedActive = false;
    closeRealtime();
    button.disabled = false;
    button.setAttribute("aria-pressed", "false");
    button.textContent = "🎤 Voice measure";
    setStatus("Voice commands are off.");
    speechRun += 1;
    speakingPrompt = false;
    activeUtterance = null;
    window.speechSynthesis?.cancel?.();
  }

  button.addEventListener("click", () => { if (listening || connecting) stopListening(); else startListening(); });
  window.addEventListener("splashcad:measurements-ready", () => { if(listening)setTimeout(beginGuide,250);else setStatus("Tap Voice measure to start."); });
  document.addEventListener("wheel",event=>{const input=event.target?.closest?.('input[type="number"]');if(input&&input===document.activeElement)input.blur();},{capture:true,passive:true});
})();
