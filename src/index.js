import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import ReactDOM from "react-dom";
import Scanner from "./zbar.loader";

const WIDTH = 1920 / 1.5;
const HEIGHT = 1080 / 1.5;

function adj(m) {
  // Compute the adjugate of m
  return [
    m[4] * m[8] - m[5] * m[7],
    m[2] * m[7] - m[1] * m[8],
    m[1] * m[5] - m[2] * m[4],
    m[5] * m[6] - m[3] * m[8],
    m[0] * m[8] - m[2] * m[6],
    m[2] * m[3] - m[0] * m[5],
    m[3] * m[7] - m[4] * m[6],
    m[1] * m[6] - m[0] * m[7],
    m[0] * m[4] - m[1] * m[3]
  ];
}
function multmm(a, b) {
  // multiply two matrices
  let c = Array(9);
  for (let i = 0; i !== 3; ++i) {
    for (let j = 0; j !== 3; ++j) {
      let cij = 0;
      for (let k = 0; k !== 3; ++k) {
        cij += a[3 * i + k] * b[3 * k + j];
      }
      c[3 * i + j] = cij;
    }
  }
  return c;
}
function multmv(m, v) {
  // multiply matrix and vector
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2]
  ];
}
function pdbg(m, v) {
  let r = multmv(m, v);
  return r + " (" + r[0] / r[2] + ", " + r[1] / r[2] + ")";
}
function basisToPoints(x1, y1, x2, y2, x3, y3, x4, y4) {
  let m = [x1, x2, x3, y1, y2, y3, 1, 1, 1];
  let v = multmv(adj(m), [x4, y4, 1]);
  return multmm(m, [v[0], 0, 0, 0, v[1], 0, 0, 0, v[2]]);
}
function general2DProjection(
  x1s,
  y1s,
  x1d,
  y1d,
  x2s,
  y2s,
  x2d,
  y2d,
  x3s,
  y3s,
  x3d,
  y3d,
  x4s,
  y4s,
  x4d,
  y4d
) {
  let s = basisToPoints(x1s, y1s, x2s, y2s, x3s, y3s, x4s, y4s);
  let d = basisToPoints(x1d, y1d, x2d, y2d, x3d, y3d, x4d, y4d);
  return multmm(d, adj(s));
}
function project(m, x, y) {
  let v = multmv(m, [x, y, 1]);
  return [v[0] / v[2], v[1] / v[2]];
}
function transform2d(elt, x1, y1, x2, y2, x3, y3, x4, y4) {
  let w = elt.offsetWidth,
    h = elt.offsetHeight;
  let t = general2DProjection(
    0,
    0,
    x1,
    y1,
    w,
    0,
    x2,
    y2,
    0,
    h,
    x3,
    y3,
    w,
    h,
    x4,
    y4
  );
  for (let i = 0; i !== 9; ++i) t[i] = t[i] / t[8];
  t = [
    t[0],
    t[3],
    0,
    t[6],
    t[1],
    t[4],
    0,
    t[7],
    0,
    0,
    1,
    0,
    t[2],
    t[5],
    0,
    t[8]
  ];
  t = "matrix3d(" + t.join(", ") + ")";
  elt.style["-webkit-transform"] = t;
  elt.style["-moz-transform"] = t;
  elt.style["-o-transform"] = t;
  elt.style.transform = t;
}

async function loadZBar() {
  // const wasm_file_path = "https://42jdt.csb.app/";
  const wasm_file_path = window.location.href;
  const scanner = await Scanner({ locateFile: file => wasm_file_path + file });
  return scanner;
}

function useWebcam() {
  const [video, setVideo] = useState();

  useEffect(() => {
    async function init() {
      if (!video) {
        const el = document.createElement("video");
        el.setAttribute("playsinline", true);
        el.setAttribute("autoplay", true);

        el.addEventListener("loadedmetadata", () => setVideo(el), false);

        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            width: { ideal: WIDTH },
            height: { ideal: HEIGHT }
          },
          audio: false
        });
        el.srcObject = mediaStream;
      }
    }

    init();
  }, [video]);

  function onStart() {
    video.play();
  }

  return { video, onStart };
}

function App() {
  const canvasRef = useRef();
  const scanner = useRef(null);
  const { video, onStart: onStartVideo } = useWebcam();

  const [results, setResults] = useState([]);

  useLayoutEffect(() => {
    loadZBar().then(s => (scanner.current = s));
  }, []);

  function handleStart() {
    onStartVideo();
    // DeviceOrientationEvent.requestPermission();
  }

  useEffect(() => {
    const canvas = canvasRef.current;

    async function start() {
      if (!video || !canvas || !scanner.current || video.videoWidth <= 0)
        return;

      const context = canvas.getContext("2d");

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // canvas.width = window.innerWidth;
      // canvas.height = window.innerHeight;

      function loop(time) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        context.fillStyle = "rgba(0,0,255,0.85)";

        const imgData = context.getImageData(0, 0, canvas.width, canvas.height);

        const scanRes = scanner.current.scanQrcode(
          imgData.data,
          canvas.width,
          canvas.height
        );

        const results = scanRes.map(qr => {
          const [data, ...points] = qr.split(";");
          const pointsParsed = points.map(p => p.split(","));
          return { data, points: pointsParsed, lastFound: time };
        });

        setResults(old => {
          const datas = [
            ...new Set([...results.map(r => r.data), ...old.map(r => r.data)])
          ];
          const unique = datas.map(
            data =>
              results.find(d => d.data === data) ||
              old.find(d => d.data === data)
          );
          const news = unique.filter(e => time - e.lastFound < 500);
          return news;
        });

        // results.forEach(({ data, points }) => {
        //   const [p1, p2, p3, p4] = points;
        //   context.beginPath();
        //   context.moveTo(...p1);
        //   context.lineTo(...p2);
        //   context.lineTo(...p3);
        //   context.lineTo(...p4);
        //   context.lineTo(...p1);
        //   context.fill();
        // });

        requestAnimationFrame(loop);
      }

      requestAnimationFrame(loop);
    }

    start();
  }, [video]);

  return (
    <>
      <canvas ref={canvasRef} />
      <div>
        <button onClick={handleStart}>Start</button>
      </div>
      {results.map(({ data, points }) => (
        <div
          style={{
            position: "absolute",
            backgroundColor: "darkred",
            color: "white",
            left: (points[0][0] / HEIGHT) * window.innerWidth + "px",
            top: (points[0][1] / WIDTH) * window.innerHeight + "px",
            width: 200,
            height: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          {data}
        </div>
      ))}
    </>
  );
}

ReactDOM.render(<App />, document.getElementById("root"));

// const main = async () => {
//   const wasm_file_path = "https://s9z8n.csb.app/";
//   const scanner = await Scanner({ locateFile: file => wasm_file_path + file });

//   const video = await startVideo();

//   const canvas = document.createElement("canvas");
//   document.body.appendChild(canvas);
//   canvas.width = 756;
//   canvas.height = 1008;
//   const context = canvas.getContext("2d");

//   function loop() {
//     context.drawImage(video, 0, 0, canvas.width, canvas.height);
//     const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

//     const scanRes = scanner.scanQrcode(
//       imageData.data,
//       canvas.width,
//       canvas.height
//     );

//     scanRes.forEach(el => {
//       const [data, ...points] = el.split(";");

//       let div = divs[data];
//       if (!div) {
//         div = document.createElement("div");
//         div.classList.add("targetDiv");
//         document.body.appendChild(div);
//         divs[data] = div;
//       }

//       div.style.display = "block";

//       // const marker = markersParsed.find(m => m.MarkerTag === data);
//       // console.log(marker);
//       const pointsParsed = points.map(p => p.split(","));
//       const [p1, p2, p3, p4] = pointsParsed;
//       // -1,-1 p1
//       // 1, -1 p4
//       // -1, 1 p2
//       // 1, 1 p3

//       //-1,-1 p1
//       // -1,1 p2
//       // 1,1  p3
//       // 1,-1 p4
//       transform2d(div, ...p1, ...p4, ...p2, ...p3);
//       // div.innerHTML = marker.HTML;
//       // div.style.backgroundColor = marker.Color7l6m || "green";
//       div.innerHTML = "<h1>TEST</h1>";
//       div.style.backgroundColor = "green";
//     });

//     // console.log(divs);
//     const toRemove = Object.keys(divs)
//       .filter(d => scanRes.some(k => !k.startsWith(d)))
//       .map(d => d.MarkerTag);
//     toRemove.forEach(k => {
//       divs[k] && document.body.removeChild(divs[k]);
//       divs[k] = null;
//     });

//     if (scanRes.length === 0) {
//       divs = {};
//       const elements = document.querySelectorAll(".targetDiv");
//       elements.forEach(e => e.parentNode.removeChild(e));
//     }

//     requestAnimationFrame(loop);
//   }
//   requestAnimationFrame(loop);
// };

// main();
