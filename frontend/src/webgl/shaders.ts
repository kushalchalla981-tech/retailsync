// Ported from the reference card material (OGL → three.js ShaderMaterial).
// three injects position/uv/normal + matrices, so the attribute/uniform decls are dropped.

const chunks = /* glsl */ `
float cmap(float v, float inMin, float inMax, float outMin, float outMax) {
  return clamp(outMin + (outMax - outMin) * (v - inMin) / (inMax - inMin), min(outMin, outMax), max(outMin, outMax));
}
float parabola(float x) { return 4.0 * x * (1.0 - x); }
vec2 rotateUV(vec2 uv, float r) {
  float c = cos(r), s = sin(r);
  uv -= 0.5;
  return mat2(c, -s, s, c) * uv + 0.5;
}
vec3 blendScreen(vec3 base, vec3 blend) { return 1.0 - (1.0 - base) * (1.0 - blend); }
vec3 blendScreen(vec3 base, vec3 blend, float opacity) { return mix(base, blendScreen(base, blend), opacity); }
`;

export const cardVertex = /* glsl */ `
#define PI 3.1415926538
uniform float uVelocity;
uniform float uVelocityAbs;
uniform float uIndex;
uniform float uFold;
uniform float uHover;
uniform float uBump;
uniform float uTime;
uniform vec2 uHit;
varying vec2 vUv;
${chunks}

void main() {
  vUv = uv;
  vec4 viewPos = modelViewMatrix * vec4(position, 1.0);
  vec3 ndcPosition = viewPos.xyz / viewPos.w;

  vec3 newPos = position;

  // carousel arc: centre card pushed toward camera, neighbours recede
  newPos.z += parabola(cmap(ndcPosition.x, -1., 1., 0., 1.)) * 0.4 * uBump;
  newPos.z += max(abs(uVelocityAbs) * -0.7, -0.1) * uBump;

  // paper wobble
  newPos.z -= sin(uv.y * 10. + uIndex) * 0.01 * uBump;
  newPos.y -= cos(uv.x * 10. + uIndex + 100.) * 0.0035 * uBump;

  // subtle floating alive wave
  newPos.z += sin(uv.x * PI + uv.y * 2.0 + uTime * 1.4 + uIndex * 0.8) * 0.007 * (1.0 - uFold);

  // fold / unfold intro
  newPos.z += uFold * .4;
  newPos.z -= cos(uv.x * 0.4 + uv.y * PI * 2. + uIndex * 0.05) * 0.15 * uFold;
  newPos.y -= cos(uv.x * 0.4 + uv.y * PI * 2. + uIndex * 0.05) * 0.35 * uFold;

  // pointer dent
  float dist = cmap(distance(uv - vec2(0.5), uHit), 0., 0.35, 1., 0.) * uHover * cmap(uBump, 0., 1., 0.5, 1.);
  newPos.z -= dist * 0.05;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);
}
`;

export const cardFragment = /* glsl */ `
#define PI 3.14159265359
uniform sampler2D uMap;
uniform sampler2D uPreview;
uniform sampler2D uNormal;
uniform float uFold;
uniform float uHover;
uniform float uReveal;
uniform float uIndex;
uniform float uAlpha;
uniform float uTime;
uniform float uPaperBlend;
uniform float uPaperDisplacement;
uniform vec2 uHit;
varying vec2 vUv;
${chunks}

float rectangle(vec2 st, vec2 size, float aa) {
  size -= vec2(aa);
  size = vec2(0.5) - size * 0.5;
  vec2 uv = vec2(smoothstep(size.x - aa, size.x, st.x), smoothstep(size.y - aa, size.y, st.y));
  uv *= vec2(smoothstep(size.x - aa, size.x, 1.0 - st.x), smoothstep(size.y - aa, size.y, 1.0 - st.y));
  return uv.x * uv.y;
}

void main() {
  // Ticket side punch notches: circular notches at y = 0.50 and perforation at y = 0.63
  vec2 aspectUV = vec2(vUv.x * 0.75, vUv.y);
  float dLeft1 = distance(aspectUV, vec2(0.0, 0.5));
  float dRight1 = distance(aspectUV, vec2(0.75, 0.5));
  float dLeft2 = distance(aspectUV, vec2(0.0, 0.627));
  float dRight2 = distance(aspectUV, vec2(0.75, 0.627));
  if (dLeft1 < 0.032 || dRight1 < 0.032 || dLeft2 < 0.022 || dRight2 < 0.022) discard;

  vec2 normalUV = rotateUV(vUv, uIndex * PI / 2.);
  vec3 normalTexel = texture2D(uNormal, normalUV).rgb;
  float dist = cmap(distance(vUv - vec2(0.5), uHit), 0., 0.35, 1., 0.) * uHover;

  vec2 uv = vUv - normalTexel.g * uPaperDisplacement + dist * uPaperDisplacement * normalTexel.g;

  vec4 preview = texture2D(uPreview, uv);
  vec4 scene = texture2D(uMap, uv);
  vec4 finalColor = mix(preview, scene, uReveal);

  finalColor.rgb = blendScreen(finalColor.rgb, normalTexel.rgb, uPaperBlend);
  finalColor.rbg -= (cmap(normalTexel.g, 0., 0.1, 0.05, 0.) - normalTexel.g * dist * 0.1) * (uPaperBlend / 0.2);

  // Holographic chromatic foil dispersion sheen on hover
  if (uHover > 0.001) {
    float angle = (vUv.x * 2.2 + vUv.y * 2.8) * 5.0 + uHit.x * 7.0 + uHit.y * 5.0 + uTime * 0.9;
    vec3 foil = vec3(
      sin(angle) * 0.5 + 0.5,
      sin(angle + 2.09439) * 0.5 + 0.5,
      sin(angle + 4.18879) * 0.5 + 0.5
    );
    float sweep = smoothstep(0.35, 0.65, sin((vUv.x - vUv.y * 0.6) * 7.0 + uHit.x * 6.0 + uTime * 1.2));
    vec3 holo = foil * (0.6 + 0.4 * sweep);
    finalColor.rgb = mix(finalColor.rgb, finalColor.rgb + holo * 0.38, uHover * 0.65);
  }

  float offset = vUv.x * 0.04 * uFold;
  if (vUv.y - offset < uFold) discard;

  float rect = rectangle(vUv, vec2(1.), 0.008);
  finalColor.a *= rect * uAlpha;
  gl_FragColor = finalColor;
}
`;
