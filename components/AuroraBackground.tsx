"use client";

import { useEffect, useRef } from "react";

export default function AuroraBackground({
  mousePosition,
}: {
  mousePosition: { x: number; y: number };
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const gl = canvas.getContext("webgl");

    if (!gl) return;

    let mx = 0;
    let my = 0;

    const vertex = `
      attribute vec2 position;
      void main() {
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;

    const fragment = `
      precision highp float;

      uniform float uTime;
      uniform vec2 uResolution;
      uniform vec2 uMouse;

      void main() {
        vec2 uv = gl_FragCoord.xy / uResolution.xy;

        vec2 pos = uv * 2.0 - 1.0;
        pos.x *= uResolution.x / uResolution.y;

        vec2 mouse = uMouse / uResolution;
        mouse = mouse * 2.0 - 1.0;
        mouse.x *= uResolution.x / uResolution.y;

        float t = uTime * 0.25;

        float d = distance(pos, mouse);
        float force = 0.35 / (d + 0.25);

        pos += normalize(pos - mouse + 0.001) * force * 0.18;

        float n = sin(pos.x * 2.0 + t) * sin(pos.y * 2.0 - t);

        vec3 col = mix(
          vec3(0.05, 0.0, 0.12),
          vec3(0.55, 0.2, 1.0),
          n * 0.5 + 0.5
        );

        col += vec3(0.1, 0.6, 1.0) * (1.0 - d);

        float vignette = smoothstep(1.4, 0.2, length(pos));
        col *= vignette;

        gl_FragColor = vec4(col, 1.0);
      }
    `;

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };

    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(program);
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
        -1,  1,
         1, -1,
         1,  1,
      ]),
      gl.STATIC_DRAW
    );

    const position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const timeU = gl.getUniformLocation(program, "uTime");
    const resU = gl.getUniformLocation(program, "uResolution");
    const mouseU = gl.getUniformLocation(program, "uMouse");

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    resize();
    window.addEventListener("resize", resize);

    const render = (t: number) => {
      mx += (mousePosition.x - mx) * 0.1;
      my += (mousePosition.y - my) * 0.1;

      gl.uniform1f(timeU, t * 0.001);
      gl.uniform2f(resU, canvas.width, canvas.height);
      gl.uniform2f(mouseU, mx, my);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [mousePosition]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
    />
  );
}