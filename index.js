const AudioContext = window.AudioContext || window.webkitAudioContext;
const context = new AudioContext();

const lg = async (x) => console.log(await x);

let isRecording = false,
    isMonitoring = false;

// AUDIO

const medianStart = new GainNode(context);
const medianEnd = new GainNode(context);

// SETUP MONITOR

const monitorNode = context.createGain();
monitorNode.gain.value = 0;

const updateMonitorGain = (enabled) => {
    const newVal = enabled ? 1 : 0;
    monitorNode.gain.setTargetAtTime(newVal, context.currentTime, 0.01);
};

// SETUP VISUALIZER: LIVE

// SETUP VIZ: RECORDING

// Get mic and call func

// SETUP MIC

const setMicGetProcessorNode = async () => {
    const dataArr = [];

    // Triggered when mic is selected
    const setupProcessor = (stream) => {
        const micSource = context.createMediaStreamSource(stream);

        micSource.connect(medianStart);

        const processor = context.createScriptProcessor(1024, 1, 1);

        processor.onaudioprocess = function (e) {
            if (isRecording) {
                const data = e.inputBuffer.getChannelData(0);
                dataArr.push(...data);

                console.log(
                    `${dataArr.length}, ${dataArr[dataArr.length - 1]}`,
                );
            }
        };

        return processor;
    };

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

// FINAL CHAIN

async function setupContext() {
    const processor = await setMicGetProcessorNode(medianStart);

    if (context.state === "suspended") {
        await context.resume();
    }

    // Mic to proces

    medianStart.connect(medianEnd);

    medianEnd.connect(monitorNode).connect(context.destination);

    // Separate out for SP. Thru SP to dest only doesn't output any audio
    // https://github.com/WebAudio/web-audio-api/issues/345
    medianEnd.connect(processor).connect(context.destination);
    // processor.connect(context.destination);
}

setupContext();

// CONTROLS

const recordButton = document.querySelector("#record"),
    recordText = recordButton.querySelector("span");

recordButton.addEventListener("click", (e) => {
    isRecording = !isRecording;

    recordText.innerHTML = isRecording ? "Stop" : "Start";
});

const monitorButton = document.querySelector("#monitor"),
    monitorText = monitorButton.querySelector("span");

monitorButton.addEventListener("click", (e) => {
    isMonitoring = !isMonitoring;

    updateMonitorGain(isMonitoring);

    monitorText.innerHTML = isMonitoring ? "off" : "on";
});

context.addEventListener("statechange", (e) => {
    document.querySelector("#ctx-status").innerHTML = context.state;
});
