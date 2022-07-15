const AudioContext = window.AudioContext || window.webkitAudioContext;
const context = new AudioContext();

const lg = async (x) => console.log(await x);

let isRecording = false,
    isMonitoring = false;

let vizVar = true;

const analyserNode = new AnalyserNode(context, {
    fftSize: 128,
});

// AUDIO

const medianStart = new GainNode(context);
const medianEnd = new GainNode(context);

let dataArr = [],
    currData = [];

// SETUP MONITOR

const monitorNode = context.createGain();
monitorNode.gain.value = 0;

const updateMonitorGain = (enabled) => {
    const newVal = enabled ? 1 : 0;
    monitorNode.gain.setTargetAtTime(newVal, context.currentTime, 0.01);
};

// Controls

const monitorButton = document.querySelector("#monitor"),
    monitorText = monitorButton.querySelector("span");

monitorButton.addEventListener("click", (e) => {
    isMonitoring = !isMonitoring;

    updateMonitorGain(isMonitoring);

    monitorText.innerHTML = isMonitoring ? "off" : "on";
});

// SETUP VISUALIZER

// Live Script Vis

const visualizer = document.querySelector("#live-canvas");

let dx = 0;

const drawLiveVis = () => {
    requestAnimationFrame(drawLiveVis);

    if (!vizVar) return;
    if (!currData) return;

    const bufferLength = currData.length;

    const width = visualizer.width,
        height = visualizer.height;

    const canvasContext = visualizer.getContext("2d");

    // save buffer as data

    let mode = currData.reduce((e, a) => a + e, 0) / currData.length;

    let loudness = mode;

    canvasContext.fillStyle = "red";
    canvasContext.fillRect(dx, ((1 - loudness) * height) / 2, 1, 1);

    canvasContext.fillStyle = "black";

    canvasContext.fillRect(
        dx,
        ((1 - loudness) * height) / 2,
        1,
        loudness * height,
    );

    if (dx < width - 1) {
        dx++;
    } else {
        dx = 0;
    }

    canvasContext.fillStyle = "rgba(255,255,255,.8)";
    canvasContext.fillRect(dx + 1, 0, 1, height);
    canvasContext.fillStyle = "black";
    canvasContext.fillRect(dx - 1, ((1 - loudness) * height) / 2, 1, 1);
};

drawLiveVis();

// Live Analyzer Vis

const anaVis = document.querySelector("#analyzer-vis");
function drawAnalyserVis() {
    requestAnimationFrame(drawAnalyserVis);

    if (!vizVar) return;

    const bufferLength = analyserNode.frequencyBinCount;

    const width = anaVis.width,
        height = anaVis.height,
        barWidth = width / bufferLength;

    const canvasContext = anaVis.getContext("2d");
    canvasContext.clearRect(0, 0, width, height);

    // save buffer as data
    const dataArray = new Uint8Array(bufferLength);
    analyserNode.getByteFrequencyData(dataArray);

    // console.log("anavis" + dataArray);

    dataArray.forEach((item, index) => {
        const y = (item / 255) * height * 0.9;
        const x = barWidth * index;

        canvasContext.fillStyle = `hsl(${(y / height) * 2 * 200}, 100%, 50%)`;
        canvasContext.fillRect(x, height - y, barWidth, y);
    });
}

drawAnalyserVis();

// Controls

const vizToggle = document.querySelector("#viz-toggle");

vizToggle.addEventListener("click", (e) => {
    vizVar = !vizVar;

    vizToggle.querySelector("span").innerHTML = vizVar ? "Pause" : "Play";
});

// RECORDING

// Recording Controls

const recordButton = document.querySelector("#record"),
    recordText = recordButton.querySelector("span"),
    player = document.querySelector("#player");

recordButton.addEventListener("click", (e) => {
    isRecording = !isRecording;

    recordText.innerHTML = isRecording ? "Stop" : "Start";

    if (isRecording) {
    } else {
        document.querySelector("#data-len").innerHTML = dataArr.length;
        player.src = URL.createObjectURL(new Blob(dataArr));
    }
});

// Get mic and call func

// SETUP

// Mic

const processCallback = (stream) => {
    const micSource = context.createMediaStreamSource(stream);

    micSource.connect(medianStart);

    const processor = context.createScriptProcessor(256, 1, 1);

    processor.onaudioprocess = function (e) {
        currData = e.inputBuffer.getChannelData(0);

        if (isRecording) {
            dataArr.push(currData);

            lg(dataArr);
        }
    };

    return processor;
};

const setMicGetProcessorNode = async () => {
    // Triggered when mic is selected
    const setupProcessor = processCallback;

    const at20 =
        "7c142e20af72ddc0bb42359c74b7693031ac4cf27870749f0f53553d15fd6c8f";

    return await navigator.mediaDevices
        .getUserMedia({
            audio: {
                deviceId: at20,
                echoCancellation: false,
                autoGainControl: false,
                noiseSuppression: false,
                latency: 0,
            },
        })
        .then(setupProcessor);
};

// Initializer

async function setupContext() {
    const processor = await setMicGetProcessorNode(medianStart);

    if (context.state === "suspended") {
        await context.resume();
    }

    // Mic to proces

    medianStart
        .connect(medianEnd)
        .connect(monitorNode)
        .connect(context.destination);

    // Separate out for SP. Thru SP to dest only doesn't output any audio
    // https://github.com/WebAudio/web-audio-api/issues/345
    medianEnd
        .connect(analyserNode)
        .connect(processor)
        .connect(context.destination);
}

setupContext();

context.addEventListener("statechange", (e) => {
    document.querySelector("#ctx-status").innerHTML = context.state;
});
