const AudioContext = window.AudioContext || window.webkitAudioContext;
const context = new AudioContext();

const scriptSampleRate = 256;
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

let dataArr = new Array(2).fill([]),
    currData = new Array(2).fill([]);
currData = new Array(2).fill([]);

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

    let mode = currData[0].reduce((e, a) => a + e, 0) / currData[0].length;

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
        // Float32Array samples
        const [left, right] = dataArr;

        // interleaved
        const interleaved = new Float32Array(left.length + right.length);
        for (let src = 0, dst = 0; src < left.length; src++, dst += 2) {
            interleaved[dst] = left[src];
            interleaved[dst + 1] = right[src];
        }

        // get WAV file bytes and audio params of your audio source
        const wavBytes = getWavBytes(interleaved.buffer, {
            isFloat: true, // floating point or 16-bit integer
            numChannels: 2,
            sampleRate: 44100,
        });
        const wav = new Blob([wavBytes], { type: "audio/wav" });

        document.querySelector("#data-len").innerHTML = dataArr[0].length;
        player.src = URL.createObjectURL(wav, {
            type: "audio/wav",
        });
    }
});

// Get mic and call func

// SETUP

// Mic

const processCallback = (stream) => {
    const micSource = context.createMediaStreamSource(stream);

    micSource.connect(medianStart);

    const processor = context.createScriptProcessor(scriptSampleRate, 2, 2);

    processor.onaudioprocess = function (e) {
        currData[0] = e.inputBuffer.getChannelData(0);

        currData[1] = e.inputBuffer.getChannelData(1);

        if (isRecording) {
            dataArr[0].push(...currData[0]);
            dataArr[1].push(...currData[1]);
        }
        // Have to set output buffer to get audio afterwards
    };;

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
    // NEVERMIND I DIDNT SET OUTPUT
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

function getWavBytes(buffer, options) {
    const type = options.isFloat ? Float32Array : Uint16Array;
    const numFrames = buffer.byteLength / type.BYTES_PER_ELEMENT;

    const headerBytes = getWavHeader(Object.assign({}, options, { numFrames }));
    const wavBytes = new Uint8Array(headerBytes.length + buffer.byteLength);

    // prepend header, then add pcmBytes
    wavBytes.set(headerBytes, 0);
    wavBytes.set(new Uint8Array(buffer), headerBytes.length);

    return wavBytes;
}

// adapted from https://gist.github.com/also/900023
// returns Uint8Array of WAV header bytes
function getWavHeader(options) {
    const numFrames = options.numFrames;
    const numChannels = options.numChannels || 2;
    const sampleRate = options.sampleRate || 44100;
    const bytesPerSample = options.isFloat ? 4 : 2;
    const format = options.isFloat ? 3 : 1;

    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = numFrames * blockAlign;

    const buffer = new ArrayBuffer(44);
    const dv = new DataView(buffer);

    let p = 0;

    function writeString(s) {
        for (let i = 0; i < s.length; i++) {
            dv.setUint8(p + i, s.charCodeAt(i));
        }
        p += s.length;
    }

    function writeUint32(d) {
        dv.setUint32(p, d, true);
        p += 4;
    }

    function writeUint16(d) {
        dv.setUint16(p, d, true);
        p += 2;
    }

    writeString("RIFF"); // ChunkID
    writeUint32(dataSize + 36); // ChunkSize
    writeString("WAVE"); // Format
    writeString("fmt "); // Subchunk1ID
    writeUint32(16); // Subchunk1Size
    writeUint16(format); // AudioFormat https://i.stack.imgur.com/BuSmb.png
    writeUint16(numChannels); // NumChannels
    writeUint32(sampleRate); // SampleRate
    writeUint32(byteRate); // ByteRate
    writeUint16(blockAlign); // BlockAlign
    writeUint16(bytesPerSample * 8); // BitsPerSample
    writeString("data"); // Subchunk2ID
    writeUint32(dataSize); // Subchunk2Size

    return new Uint8Array(buffer);
}