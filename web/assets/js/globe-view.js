let THREE = null;
let OrbitControls = null;
let moduleLoadPromise = null;

async function ensureWebGlModules() {
  if (THREE && OrbitControls) {
    return;
  }

  if (!moduleLoadPromise) {
    moduleLoadPromise = (async () => {
      try {
        // Prefer local vendor files via import map to avoid CDN dependency.
        const [threeModule, controlsModule] = await Promise.all([
          import("three"),
          import("three/addons/controls/OrbitControls.js"),
        ]);
        THREE = threeModule;
        OrbitControls = controlsModule.OrbitControls;
        return;
      } catch (localError) {
        console.warn("[globe] local three modules unavailable, fallback to CDN", localError);
      }

      const [threeModule, controlsModule] = await Promise.all([
        import("https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js"),
        import("https://cdn.jsdelivr.net/npm/three@0.161.0/examples/jsm/controls/OrbitControls.js"),
      ]);
      THREE = threeModule;
      OrbitControls = controlsModule.OrbitControls;
    })();
  }

  await moduleLoadPromise;
}
const DEG2RAD = Math.PI / 180;
const EARTH_RADIUS = 1.68;
const DEFAULT_START_HUB_NAME = "US-E";
const DEFAULT_END_HUB_NAME = "US-W";
const MIN_START_CONFIDENCE = 2.05;
const MIN_SECONDARY_CONFIDENCE = 0.92;
const FOCUS_DURATION_MS = 1200;
const FOCUS_DURATION_REDUCED_MS = 280;
const FOCUS_AUTO_ROTATE_RESUME_DELAY_MS = 1700;

const HUBS = [
  { name: "US-E", lat: 40.7128, lon: -74.006, keywords: ["UNITED STATES", "USA", "U.S.", "US", "WASHINGTON", "NEW YORK", "WALL STREET", "S&P", "DOW", "TREASURY", "FED", "FOMC", "USD", "NFP", "CPI", "美國", "美国", "紐約", "纽约", "華盛頓", "华盛顿", "美聯儲", "美联储"] },
  { name: "US-W", lat: 37.7749, lon: -122.4194, keywords: ["CALIFORNIA", "SAN FRANCISCO", "SILICON VALLEY", "SEATTLE", "LOS ANGELES", "NASDAQ", "AAPL", "MSFT", "AMZN", "GOOGL", "GOOGLE", "META", "TSLA", "NVDA"] },
  { name: "CAN", lat: 43.6532, lon: -79.3832, keywords: ["CANADA", "TORONTO", "OTTAWA", "BANK OF CANADA", "CAD", "加拿大"] },
  { name: "UK", lat: 51.5074, lon: -0.1278, keywords: ["UNITED KINGDOM", "UK", "LONDON", "BANK OF ENGLAND", "BOE", "FTSE", "STERLING", "GBP", "英國", "英国", "倫敦", "伦敦"] },
  { name: "EU", lat: 50.1109, lon: 8.6821, keywords: ["EUROPE", "EUROZONE", "EU", "ECB", "EURO", "EUR", "GERMANY", "FRANCE", "ITALY", "SPAIN", "BRUSSELS", "FRANKFURT", "PARIS", "DAX", "CAC", "LUXEMBOURG", "歐洲", "欧洲", "德國", "德国", "法國", "法国"] },
  { name: "RUS", lat: 55.7558, lon: 37.6176, keywords: ["RUSSIA", "RUSSIAN", "MOSCOW", "KREMLIN", "RUBLE", "RUB", "GAZPROM", "ROSNEFT", "俄羅斯", "俄罗斯", "莫斯科"] },
  { name: "ME", lat: 25.2048, lon: 55.2708, keywords: ["MIDDLE EAST", "IRAN", "ISRAEL", "SAUDI", "UAE", "QATAR", "DUBAI", "ABU DHABI", "RIYADH", "OPEC", "BRENT", "GULF", "OIL", "中東", "中东", "伊朗", "以色列", "沙特", "阿聯酋", "阿联酋"] },
  { name: "TUR", lat: 41.0082, lon: 28.9784, keywords: ["TURKEY", "ISTANBUL", "ANKARA", "TRY", "BIST", "土耳其"] },
  { name: "IND", lat: 28.6139, lon: 77.209, keywords: ["INDIA", "NEW DELHI", "MUMBAI", "RBI", "RUPEE", "INR", "NIFTY", "SENSEX", "印度", "新德里", "孟買", "孟买"] },
  { name: "SEA", lat: 1.3521, lon: 103.8198, keywords: ["SINGAPORE", "MALAYSIA", "THAILAND", "VIETNAM", "PHILIPPINES", "ASEAN", "SGD", "MYR", "THB", "VND", "PHP", "新加坡", "馬來西亞", "马来西亚", "泰國", "泰国", "越南", "菲律賓", "菲律宾"] },
  { name: "IDN", lat: -6.2088, lon: 106.8456, keywords: ["INDONESIA", "JAKARTA", "IDR", "JCI", "印尼", "印度尼西亞", "印度尼西亚"] },
  { name: "HKG", lat: 22.3193, lon: 114.1694, keywords: ["HONG KONG", "HK", "HANG SENG", "HSI", "CHINA", "BEIJING", "SHANGHAI", "SHENZHEN", "PBOC", "CNY", "CNH", "RMB", "HKD", "人民銀行", "人民银行", "香港", "中國", "中国", "北京", "上海", "深圳"] },
  { name: "TYO", lat: 35.6762, lon: 139.6503, keywords: ["JAPAN", "TOKYO", "BOJ", "NIKKEI", "TOPIX", "YEN", "JPY", "日本", "東京", "东京", "日圓", "日元"] },
  { name: "SEO", lat: 37.5665, lon: 126.978, keywords: ["SOUTH KOREA", "KOREA", "SEOUL", "KOSPI", "KOSDAQ", "KRW", "SAMSUNG", "韓國", "韩国", "首爾", "首尔"] },
  { name: "LATAM", lat: -23.5505, lon: -46.6333, keywords: ["BRAZIL", "MEXICO", "ARGENTINA", "CHILE", "LATAM", "SAO PAULO", "BANXICO", "BOVESPA", "IBOV", "BRL", "MXN", "CLP", "巴西", "墨西哥", "阿根廷"] },
  { name: "AUS", lat: -33.8688, lon: 151.2093, keywords: ["AUSTRALIA", "SYDNEY", "MELBOURNE", "ASX", "RBA", "AUD", "NZD", "RBNZ", "澳洲", "澳大利亞", "澳大利亚", "悉尼"] },
];

const PLANET_TEXTURES = {
  map: [
    "./assets/textures/earth_atmos_2048.jpg",
    "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r161/examples/textures/planets/earth_atmos_2048.jpg",
  ],
  normal: [
    "./assets/textures/earth_normal_2048.jpg",
    "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r161/examples/textures/planets/earth_normal_2048.jpg",
  ],
  specular: [
    "./assets/textures/earth_specular_2048.jpg",
    "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r161/examples/textures/planets/earth_specular_2048.jpg",
  ],
};

const CURRENCY_TO_HUB = {
  USD: "US-E",
  CAD: "CAN",
  GBP: "UK",
  EUR: "EU",
  RUB: "RUS",
  TRY: "TUR",
  INR: "IND",
  SGD: "SEA",
  MYR: "SEA",
  THB: "SEA",
  VND: "SEA",
  IDR: "IDN",
  CNY: "HKG",
  CNH: "HKG",
  HKD: "HKG",
  JPY: "TYO",
  KRW: "SEO",
  BRL: "LATAM",
  MXN: "LATAM",
  CLP: "LATAM",
  AUD: "AUS",
  NZD: "AUS",
};

function getHubByName(name) {
  return HUBS.find((hub) => hub.name === name) || null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

function hashString(value) {
  const text = String(value || "");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildItemCorpus(item) {
  const title = String(item?.title || "").toUpperCase();
  const content = String(item?.content || "").toUpperCase();
  const url = String(item?.url || "");
  const author = String(item?.meta?.author || "").toUpperCase();
  const source = String(item?.source || "").toUpperCase();
  const symbols = Array.isArray(item?.symbols) ? item.symbols.join(" ") : "";
  const symbolText = String(symbols).toUpperCase();
  let host = "";
  try {
    host = url ? new URL(url).hostname.toUpperCase() : "";
  } catch (error) {
    host = String(url).toUpperCase();
  }

  return {
    title,
    content,
    meta: `${host} ${source} ${author}`.trim(),
    symbols: symbolText,
  };
}

function scoreKeywordInText(keyword, text, weight) {
  if (!text) {
    return 0;
  }

  const isShortToken = /^[A-Z0-9.-]{1,5}$/.test(keyword);
  if (isShortToken) {
    const pattern = new RegExp(`(?:^|[^A-Z0-9])${escapeRegExp(keyword)}(?:$|[^A-Z0-9])`);
    return pattern.test(text) ? 1.08 * weight : 0;
  }

  if (text.includes(keyword)) {
    return (1 + Math.min(0.72, keyword.length / 18)) * weight;
  }

  return 0;
}

function scoreHubFromCorpus(hub, corpus) {
  let score = 0;
  for (let i = 0; i < hub.keywords.length; i += 1) {
    const keyword = String(hub.keywords[i] || "").trim().toUpperCase();
    if (!keyword) {
      continue;
    }

    score += scoreKeywordInText(keyword, corpus.title, 2.4);
    score += scoreKeywordInText(keyword, corpus.symbols, 2.05);
    score += scoreKeywordInText(keyword, corpus.meta, 1.5);
    score += scoreKeywordInText(keyword, corpus.content, 1);
  }
  return score;
}

function inferHubFromFxPair(corpus) {
  const fxText = `${corpus.title} ${corpus.symbols} ${corpus.content}`;
  const pairMatch = fxText.match(/\b([A-Z]{3})\s*\/\s*([A-Z]{3})\b/);
  if (!pairMatch) {
    return null;
  }

  const baseCode = pairMatch[1];
  const quoteCode = pairMatch[2];
  const baseHubName = CURRENCY_TO_HUB[baseCode];
  const quoteHubName = CURRENCY_TO_HUB[quoteCode];

  if (!baseHubName && !quoteHubName) {
    return null;
  }

  const defaultStart = getHubByName(DEFAULT_START_HUB_NAME) || HUBS[0];
  const defaultEnd = getHubByName(DEFAULT_END_HUB_NAME) || HUBS[1] || HUBS[0];
  const baseHub = getHubByName(baseHubName) || defaultStart;
  const quoteHub = getHubByName(quoteHubName) || defaultEnd;

  if (baseHub.name === quoteHub.name) {
    if (baseHub.name === defaultStart.name) {
      return { startHub: baseHub, endHub: defaultEnd };
    }
    return { startHub: baseHub, endHub: defaultStart };
  }

  return { startHub: baseHub, endHub: quoteHub };
}

function inferHubPair(item, index) {
  const corpus = buildItemCorpus(item);
  const fxPairHub = inferHubFromFxPair(corpus);
  if (fxPairHub) {
    return fxPairHub;
  }

  const scored = HUBS.map((hub) => ({ hub, score: scoreHubFromCorpus(hub, corpus) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);

  const defaultStart = getHubByName(DEFAULT_START_HUB_NAME) || HUBS[0];
  const defaultEnd = getHubByName(DEFAULT_END_HUB_NAME) || HUBS[1] || HUBS[0];

  if (!scored.length || scored[0].score < MIN_START_CONFIDENCE) {
    return { startHub: defaultStart, endHub: defaultEnd };
  }

  const startHub = scored[0].hub;
  const secondary = scored.find((row) => row.hub.name !== startHub.name && row.score >= MIN_SECONDARY_CONFIDENCE);

  if (secondary?.hub) {
    return { startHub, endHub: secondary.hub };
  }

  if (startHub.name === defaultStart.name) {
    return { startHub, endHub: defaultEnd };
  }
  if (startHub.name === defaultEnd.name) {
    return { startHub, endHub: defaultStart };
  }

  if (index % 2 === 0) {
    return { startHub, endHub: defaultStart };
  }
  return { startHub, endHub: defaultEnd };
}

function priorityHue(priority) {
  if (priority === "critical") {
    return 0.01;
  }
  if (priority === "warning") {
    return 0.11;
  }
  return 0.56;
}

function latLonToVector3(latDeg, lonDeg, radius) {
  const phi = (90 - latDeg) * DEG2RAD;
  const theta = (lonDeg + 180) * DEG2RAD;

  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);

  return new THREE.Vector3(x, y, z);
}

function createArcPoints(start, end, altitude, segments = 56) {
  const points = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const point = start.clone().lerp(end, t).normalize();
    const lift = Math.sin(Math.PI * t) * altitude;
    point.multiplyScalar(EARTH_RADIUS + lift);
    points.push(point);
  }
  return points;
}

function loadTexture(loader, url) {
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

async function loadTextureWithFallback(loader, urls) {
  const candidates = Array.isArray(urls) ? urls : [urls];
  let lastError = null;

  for (let i = 0; i < candidates.length; i += 1) {
    const url = candidates[i];
    try {
      const texture = await loadTexture(loader, url);
      return texture;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Texture load failed");
}

function disposeObject3D(object3d) {
  object3d.traverse((obj) => {
    if (obj.geometry) {
      obj.geometry.dispose();
    }

    if (obj.material) {
      if (Array.isArray(obj.material)) {
        obj.material.forEach((material) => material.dispose());
      } else {
        obj.material.dispose();
      }
    }
  });
}

class GlobeRenderer {
  constructor(canvas, summaryElement, options = {}) {
    this.canvas = canvas;
    this.summaryElement = summaryElement;
    this.onSelect = typeof options.onSelect === "function" ? options.onSelect : () => {};

    this.visibleCount = 0;
    this.criticalCount = 0;
    this.warningCount = 0;
    this.signalSaturation = 0.45;

    this.animationId = 0;
    this.lastTs = 0;

    this.pointer = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.pointerDownPos = { x: 0, y: 0, ts: 0 };

    this.pulses = [];
    this.interactiveMarkers = [];
    this.interactiveRegions = [];
    this.regionVisuals = [];
    this.markerHalos = [];
    this.regionBuckets = new Map();
    this.itemRegionById = new Map();
    this.focusAnimation = null;
    this.focusResumeAtTs = 0;

    this.reduceMotionMedia = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.reduceMotion = this.reduceMotionMedia.matches;
    this.handleReducedMotionChange = (event) => {
      this.reduceMotion = event.matches;
      if (this.controls && !this.focusAnimation && !this.focusResumeAtTs) {
        this.controls.autoRotate = !this.reduceMotion;
      }
    };

    if (this.reduceMotionMedia.addEventListener) {
      this.reduceMotionMedia.addEventListener("change", this.handleReducedMotionChange);
    }

    this.initScene();
    this.bindEvents();
    this.resize();
    this.updateSummary();
    this.loadPlanetTextures();
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x06101c, 0.024);

    this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 100);
    this.camera.position.set(0, 0.13, 4.22);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });

    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.43;

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.enableZoom = true;
    this.controls.zoomSpeed = 0.75;
    this.controls.minDistance = 3.28;
    this.controls.maxDistance = 5.6;
    this.controls.rotateSpeed = 0.54;
    this.controls.minPolarAngle = 0.55;
    this.controls.maxPolarAngle = 2.55;
    this.controls.autoRotate = !this.reduceMotion;
    this.controls.autoRotateSpeed = 0.54;

    this.globeGroup = new THREE.Group();
    this.globeGroup.rotation.y = -2.95;
    this.scene.add(this.globeGroup);

    this.trailGroup = new THREE.Group();
    this.markerGroup = new THREE.Group();
    this.regionGroup = new THREE.Group();
    this.globeGroup.add(this.trailGroup);
    this.globeGroup.add(this.markerGroup);
    this.globeGroup.add(this.regionGroup);

    this.addLights();
    this.addStars();
    this.addEarthCore();
    this.addAtmosphere();
    this.addGridOverlay();
  }

  addLights() {
    const hemi = new THREE.HemisphereLight(0xb0dcff, 0x0a1322, 1.2);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xc3e2ff, 1.46);
    key.position.set(4.5, 2.7, 5.2);
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0x91c3ff, 0.64);
    fill.position.set(-2.6, 1.35, 3.6);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0x4478c9, 0.5);
    rim.position.set(-3.7, -1.1, -4.4);
    this.scene.add(rim);
  }

  addStars() {
    const geometry = new THREE.BufferGeometry();
    const count = 1200;
    const vertices = new Float32Array(count * 3);

    for (let i = 0; i < count; i += 1) {
      const radius = 12 + Math.random() * 18;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.cos(phi);
      const z = radius * Math.sin(phi) * Math.sin(theta);

      vertices[i * 3] = x;
      vertices[i * 3 + 1] = y;
      vertices[i * 3 + 2] = z;
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    const material = new THREE.PointsMaterial({
      color: 0x7a9bcf,
      size: 0.028,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.stars = new THREE.Points(geometry, material);
    this.scene.add(this.stars);
  }

  addEarthCore() {
    const geometry = new THREE.SphereGeometry(EARTH_RADIUS, 112, 112);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.6,
      metalness: 0.05,
      emissive: 0x0f1f36,
      emissiveIntensity: 0.2,
    });

    this.earthMesh = new THREE.Mesh(geometry, material);
    this.globeGroup.add(this.earthMesh);
  }

  addAtmosphere() {
    const outerGeometry = new THREE.SphereGeometry(EARTH_RADIUS * 1.07, 72, 72);
    const outerMaterial = new THREE.MeshBasicMaterial({
      color: 0x7cc3ff,
      transparent: true,
      opacity: 0.08,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.atmosphereOuter = new THREE.Mesh(outerGeometry, outerMaterial);
    this.globeGroup.add(this.atmosphereOuter);

    const innerGeometry = new THREE.SphereGeometry(EARTH_RADIUS * 1.018, 72, 72);
    const innerMaterial = new THREE.MeshBasicMaterial({
      color: 0x5db5ff,
      transparent: true,
      opacity: 0.06,
      side: THREE.FrontSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.atmosphereInner = new THREE.Mesh(innerGeometry, innerMaterial);
    this.globeGroup.add(this.atmosphereInner);
  }

  addGridOverlay() {
    const wireGeometry = new THREE.WireframeGeometry(new THREE.SphereGeometry(EARTH_RADIUS * 1.0015, 22, 22));
    const wireMaterial = new THREE.LineBasicMaterial({
      color: 0x78aee8,
      transparent: true,
      opacity: 0.06,
      depthWrite: false,
    });

    this.gridOverlay = new THREE.LineSegments(wireGeometry, wireMaterial);
    this.globeGroup.add(this.gridOverlay);
  }

  async loadPlanetTextures() {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");

    try {
      const [map, normal, specular] = await Promise.all([
        loadTextureWithFallback(loader, PLANET_TEXTURES.map),
        loadTextureWithFallback(loader, PLANET_TEXTURES.normal),
        loadTextureWithFallback(loader, PLANET_TEXTURES.specular),
      ]);

      map.colorSpace = THREE.SRGBColorSpace;

      const anisotropy = Math.min(16, this.renderer.capabilities.getMaxAnisotropy());
      map.anisotropy = anisotropy;
      normal.anisotropy = anisotropy;
      specular.anisotropy = anisotropy;
      map.minFilter = THREE.LinearMipmapLinearFilter;
      normal.minFilter = THREE.LinearMipmapLinearFilter;
      specular.minFilter = THREE.LinearMipmapLinearFilter;
      map.magFilter = THREE.LinearFilter;
      normal.magFilter = THREE.LinearFilter;
      specular.magFilter = THREE.LinearFilter;

      const texturedMaterial = new THREE.MeshPhongMaterial({
        map,
        normalMap: normal,
        normalScale: new THREE.Vector2(0.74, 0.74),
        specularMap: specular,
        specular: new THREE.Color(0x2a4c7b),
        shininess: 14,
        emissive: new THREE.Color(0x11223a),
        emissiveIntensity: 0.16,
        color: new THREE.Color(0xffffff),
      });

      this.earthMesh.material.dispose();
      this.earthMesh.material = texturedMaterial;
      this.updateColorIntensity();
    } catch (error) {
      console.warn("[globe] failed to load textures, using fallback material", error);
      this.updateColorIntensity();
    }
  }

  bindEvents() {
    this.handlePointerDown = (event) => {
      this.pointerDownPos = { x: event.clientX, y: event.clientY, ts: performance.now() };
      this.canvas.style.cursor = "grabbing";
    };

    this.handlePointerUp = (event) => {
      const dx = event.clientX - this.pointerDownPos.x;
      const dy = event.clientY - this.pointerDownPos.y;
      const distance = Math.hypot(dx, dy);
      const elapsed = performance.now() - this.pointerDownPos.ts;

      if (distance < 6 && elapsed < 360) {
        const picked = this.pickSignal(event);
        if (picked && picked.id) {
          this.onSelect(picked);
        }
      }

      this.canvas.style.cursor = this.isHoveringMarker(event) ? "pointer" : "grab";
    };

    this.handlePointerMove = (event) => {
      if (this.controls.state !== -1) {
        return;
      }
      this.canvas.style.cursor = this.isHoveringMarker(event) ? "pointer" : "grab";
    };

    this.handlePointerLeave = () => {
      this.canvas.style.cursor = "grab";
    };

    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.canvas.addEventListener("pointerup", this.handlePointerUp);
    this.canvas.addEventListener("pointermove", this.handlePointerMove);
    this.canvas.addEventListener("pointerleave", this.handlePointerLeave);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvas);
  }

  destroy() {
    this.stop();

    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas.removeEventListener("pointerup", this.handlePointerUp);
    this.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas.removeEventListener("pointerleave", this.handlePointerLeave);

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }

    if (this.reduceMotionMedia.removeEventListener) {
      this.reduceMotionMedia.removeEventListener("change", this.handleReducedMotionChange);
    }

    this.controls.dispose();
    disposeObject3D(this.scene);
    this.renderer.dispose();
  }

  start() {
    if (this.animationId) {
      return;
    }

    this.lastTs = 0;
    this.animationId = window.requestAnimationFrame((ts) => this.frame(ts));
  }

  stop() {
    if (!this.animationId) {
      return;
    }

    window.cancelAnimationFrame(this.animationId);
    this.animationId = 0;
  }

  focusOnItem(item, filteredIndex = -1) {
    if (!item) {
      return false;
    }

    let hub = null;
    if (item.id && this.itemRegionById.has(item.id)) {
      hub = this.itemRegionById.get(item.id);
    }

    if (!hub) {
      const fallbackIndex = Number.isFinite(filteredIndex) && filteredIndex >= 0 ? filteredIndex : 0;
      hub = inferHubPair(item, fallbackIndex).startHub;
    }

    if (!hub) {
      return false;
    }

    this.focusOnHub(hub);
    return true;
  }

  focusOnHub(hub) {
    if (!hub) {
      return;
    }

    const localVector = latLonToVector3(hub.lat, hub.lon, 1).normalize();
    const currentQuat = this.globeGroup.quaternion.clone();
    const currentWorldVector = localVector.clone().applyQuaternion(currentQuat).normalize();
    const cameraDirection = this.camera.position.clone().normalize();

    if (currentWorldVector.dot(cameraDirection) > 0.99995) {
      return;
    }

    const deltaQuat = new THREE.Quaternion().setFromUnitVectors(currentWorldVector, cameraDirection);
    const targetQuat = deltaQuat.multiply(currentQuat.clone()).normalize();
    const shouldResumeAutoRotate = this.controls.autoRotate;

    this.focusResumeAtTs = 0;
    this.controls.autoRotate = false;
    this.focusAnimation = {
      startedAt: performance.now(),
      durationMs: this.reduceMotion ? FOCUS_DURATION_REDUCED_MS : FOCUS_DURATION_MS,
      fromQuat: currentQuat,
      toQuat: targetQuat,
      shouldResumeAutoRotate,
    };
  }

  updateFocusAnimation(ts) {
    if (!this.focusAnimation) {
      return;
    }

    const progress = clamp(
      (ts - this.focusAnimation.startedAt) / this.focusAnimation.durationMs,
      0,
      1,
    );
    const eased = easeOutCubic(progress);

    this.globeGroup.quaternion.copy(this.focusAnimation.fromQuat);
    this.globeGroup.quaternion.slerp(this.focusAnimation.toQuat, eased);

    if (progress >= 1) {
      const shouldResume = this.focusAnimation.shouldResumeAutoRotate;
      this.focusAnimation = null;
      if (!this.reduceMotion && shouldResume) {
        this.controls.autoRotate = false;
        this.focusResumeAtTs = ts + FOCUS_AUTO_ROTATE_RESUME_DELAY_MS;
      } else {
        this.focusResumeAtTs = 0;
      }
    }
  }

  frame(ts) {
    if (!this.lastTs) {
      this.lastTs = ts;
    }

    const dt = clamp((ts - this.lastTs) / 1000, 0, 0.05);
    this.lastTs = ts;

    if (this.focusResumeAtTs && !this.focusAnimation && ts >= this.focusResumeAtTs) {
      this.focusResumeAtTs = 0;
      if (!this.reduceMotion) {
        this.controls.autoRotate = true;
      }
    }

    this.controls.update();
    this.updateFocusAnimation(ts);
    this.animatePulses(ts * 0.001, dt);
    this.renderer.render(this.scene, this.camera);

    this.animationId = window.requestAnimationFrame((nextTs) => this.frame(nextTs));
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(300, Math.floor(rect.width));
    const height = Math.max(220, Math.floor(rect.height));

    const dpr = clamp(window.devicePixelRatio || 1, 1, 2.4);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  setSignals(items) {
    const list = Array.isArray(items) ? items : [];
    this.visibleCount = list.length;
    this.criticalCount = list.filter((item) => item.priority === "critical").length;
    this.warningCount = list.filter((item) => item.priority === "warning").length;

    this.itemRegionById = new Map();
    for (let i = 0; i < list.length; i += 1) {
      const item = list[i];
      if (!item?.id) {
        continue;
      }
      const pair = inferHubPair(item, i);
      this.itemRegionById.set(item.id, pair.startHub);
    }

    this.signalSaturation = clamp(0.38 + list.length / 140, 0.38, 1);
    this.rebuildSignals(list);
    this.updateColorIntensity();
    this.updateSummary();
  }

  updateColorIntensity() {
    const vivid = this.signalSaturation;

    if (this.atmosphereOuter?.material) {
      this.atmosphereOuter.material.opacity = 0.05 + vivid * 0.07;
      this.atmosphereOuter.material.color.setHSL(0.56, 0.34 + vivid * 0.22, 0.66);
      this.atmosphereOuter.material.needsUpdate = true;
    }

    if (this.atmosphereInner?.material) {
      this.atmosphereInner.material.opacity = 0.04 + vivid * 0.05;
      this.atmosphereInner.material.color.setHSL(0.58, 0.28 + vivid * 0.16, 0.66);
      this.atmosphereInner.material.needsUpdate = true;
    }

    if (this.earthMesh?.material?.emissive) {
      const hasTextureMap = Boolean(this.earthMesh.material.map);
      this.earthMesh.material.emissiveIntensity = hasTextureMap ? (0.11 + vivid * 0.1) : (0.2 + vivid * 0.16);
      if (this.earthMesh.material.color) {
        if (hasTextureMap) {
          this.earthMesh.material.color.setRGB(1, 1, 1);
        } else {
          this.earthMesh.material.color.setHSL(0.56, 0.1 + vivid * 0.12, 0.64);
        }
      }
    }

    if (this.gridOverlay?.material) {
      this.gridOverlay.material.opacity = 0.045 + vivid * 0.045;
    }
  }

  updateSummary() {
    if (!this.summaryElement) {
      return;
    }

    const vividPercent = Math.round(this.signalSaturation * 100);
    this.summaryElement.textContent = `${this.visibleCount} signals | vivid ${vividPercent}% | drag rotate | click region`;
  }

  rebuildSignals(items) {
    this.clearSignalObjects();

    for (let i = 0; i < HUBS.length; i += 1) {
      this.regionBuckets.set(HUBS[i].name, []);
    }

    const maxMarkers = window.matchMedia("(max-width: 920px)").matches ? 26 : 44;
    const subset = items.slice(0, maxMarkers);

    const markerGeometry = new THREE.SphereGeometry(0.0066, 10, 10);
    const haloGeometry = new THREE.SphereGeometry(0.011, 10, 10);
    const pulseGeometry = new THREE.SphereGeometry(0.0048, 10, 10);

    subset.forEach((item, index) => {
      const key = `${item.id || "item"}-${item.source || "src"}`;
      const hash = hashString(key);

      const { startHub, endHub } = inferHubPair(item, index);
      this.regionBuckets.get(startHub.name)?.push(item);

      const latJitter = (((hash >> 5) % 1000) / 1000 - 0.5) * 2.2;
      const lonJitter = (((hash >> 9) % 1000) / 1000 - 0.5) * 2.9;

      const lat = clamp(startHub.lat + latJitter, -78, 78);
      const lon = startHub.lon + lonJitter;

      const markerPosition = latLonToVector3(lat, lon, EARTH_RADIUS * 1.01);
      const arcStart = latLonToVector3(lat, lon, EARTH_RADIUS * 1.003);
      const arcEnd = latLonToVector3(endHub.lat, endHub.lon, EARTH_RADIUS * 1.003);

      const hue = priorityHue(item.priority);
      const markerColor = new THREE.Color().setHSL(
        hue,
        this.signalSaturation,
        item.priority === "critical" ? 0.62 : 0.56,
      );

      const markerMaterial = new THREE.MeshBasicMaterial({
        color: markerColor,
        transparent: true,
        opacity: 0.9,
      });

      const markerMesh = new THREE.Mesh(markerGeometry.clone(), markerMaterial);
      markerMesh.position.copy(markerPosition);
      markerMesh.userData.item = item;
      markerMesh.userData.region = startHub.name;
      this.markerGroup.add(markerMesh);
      this.interactiveMarkers.push(markerMesh);

      const haloMaterial = new THREE.MeshBasicMaterial({
        color: markerColor,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

      const halo = new THREE.Mesh(haloGeometry.clone(), haloMaterial);
      const haloScale = item.priority === "critical" ? 0.62 : 0.48;
      halo.scale.setScalar(haloScale);
      halo.position.copy(markerPosition);
      halo.userData.phase = (hash % 628) / 100;
      halo.userData.baseScale = haloScale;
      this.markerGroup.add(halo);
      this.markerHalos.push(halo);

      const altitude = 0.09 + this.signalSaturation * 0.06 + (item.priority === "critical" ? 0.052 : 0.02);
      const arcPoints = createArcPoints(arcStart, arcEnd, altitude, 48);

      const trailGeometry = new THREE.BufferGeometry().setFromPoints(arcPoints);
      const trailMaterial = new THREE.LineBasicMaterial({
        color: markerColor,
        transparent: true,
        opacity: 0.05 + this.signalSaturation * 0.09,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

      const trailLine = new THREE.Line(trailGeometry, trailMaterial);
      this.trailGroup.add(trailLine);

      const pulseMaterial = new THREE.MeshBasicMaterial({
        color: 0xe8f1ff,
        transparent: true,
        opacity: 0.58,
        blending: THREE.AdditiveBlending,
      });
      const pulseMesh = new THREE.Mesh(pulseGeometry.clone(), pulseMaterial);
      pulseMesh.position.copy(arcPoints[0]);
      this.trailGroup.add(pulseMesh);

      this.pulses.push({
        mesh: pulseMesh,
        points: arcPoints,
        speed: 0.11 + (hash % 100) / 1000 + this.signalSaturation * 0.06,
        offset: (hash % 1000) / 1000,
        phase: index * 0.17,
      });
    });

    this.buildRegionHotspots();
  }

  buildRegionHotspots() {
    const counts = HUBS.map((hub) => (this.regionBuckets.get(hub.name) || []).length);
    const maxCount = Math.max(1, ...counts);
    const baseColor = new THREE.Color(0x7da9df);
    const hotspotGeometry = new THREE.SphereGeometry(0.018, 12, 12);
    const hitGeometry = new THREE.SphereGeometry(0.075, 10, 10);

    for (let i = 0; i < HUBS.length; i += 1) {
      const hub = HUBS[i];
      const count = counts[i];
      const relativeIntensity = count / maxCount;
      const absoluteIntensity = clamp(count / 16, 0, 1);
      const intensity = clamp(relativeIntensity * 0.72 + absoluteIntensity * 0.28, 0, 1);

      const position = latLonToVector3(hub.lat, hub.lon, EARTH_RADIUS * 1.022);

      const hue = 0.57 - intensity * 0.54;
      const sat = clamp(0.28 + this.signalSaturation * 0.42 + intensity * 0.36, 0.25, 1);
      const light = clamp(0.58 - intensity * 0.18, 0.36, 0.64);
      const color = new THREE.Color().setHSL(hue, sat, light);

      const hotspotMaterial = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.03 + intensity * 0.21,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

      const hotspot = new THREE.Mesh(hotspotGeometry.clone(), hotspotMaterial);
      const baseScale = 0.4 + intensity * 0.44;
      hotspot.scale.setScalar(baseScale);
      hotspot.position.copy(position);
      hotspot.userData.phase = i * 0.39;
      hotspot.userData.baseScale = baseScale;
      hotspot.userData.intensity = intensity;
      this.regionGroup.add(hotspot);
      this.regionVisuals.push(hotspot);

      const coreGeometry = new THREE.SphereGeometry(0.006 + intensity * 0.005, 10, 10);
      const coreMaterial = new THREE.MeshBasicMaterial({
        color: count > 0 ? color : baseColor,
        transparent: true,
        opacity: count > 0 ? 0.8 : 0.18,
      });
      const core = new THREE.Mesh(coreGeometry, coreMaterial);
      core.position.copy(position);
      this.regionGroup.add(core);

      const hitMaterial = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const hitMesh = new THREE.Mesh(hitGeometry.clone(), hitMaterial);
      hitMesh.position.copy(position);
      hitMesh.userData.region = hub.name;
      hitMesh.userData.items = this.regionBuckets.get(hub.name) || [];
      this.regionGroup.add(hitMesh);
      this.interactiveRegions.push(hitMesh);
    }
  }

  clearSignalObjects() {
    this.interactiveMarkers = [];
    this.interactiveRegions = [];
    this.regionVisuals = [];
    this.markerHalos = [];
    this.pulses = [];
    this.regionBuckets = new Map();

    while (this.markerGroup.children.length > 0) {
      const child = this.markerGroup.children.pop();
      child.parent?.remove(child);
      if (child.geometry) {
        child.geometry.dispose();
      }
      if (child.material) {
        child.material.dispose();
      }
    }

    while (this.trailGroup.children.length > 0) {
      const child = this.trailGroup.children.pop();
      child.parent?.remove(child);
      if (child.geometry) {
        child.geometry.dispose();
      }
      if (child.material) {
        child.material.dispose();
      }
    }

    while (this.regionGroup.children.length > 0) {
      const child = this.regionGroup.children.pop();
      child.parent?.remove(child);
      if (child.geometry) {
        child.geometry.dispose();
      }
      if (child.material) {
        child.material.dispose();
      }
    }
  }

  animatePulses(timeSec, dt) {
    if (!this.reduceMotion) {
      this.stars.rotation.y += dt * 0.01;
    }

    for (let i = 0; i < this.markerHalos.length; i += 1) {
      const halo = this.markerHalos[i];
      const phase = halo.userData.phase || 0;
      const baseScale = halo.userData.baseScale || 0.16;
      const pulse = 1 + Math.sin(timeSec * 2.2 + phase) * 0.18;
      halo.scale.setScalar(baseScale * pulse);
    }

    for (let i = 0; i < this.regionVisuals.length; i += 1) {
      const hotspot = this.regionVisuals[i];
      if (!hotspot) {
        continue;
      }
      const phase = hotspot.userData.phase || 0;
      const baseScale = hotspot.userData.baseScale || 0.16;
      const intensity = hotspot.userData.intensity || 0;
      const pulse = 1 + Math.sin(timeSec * 1.9 + phase) * (0.08 + intensity * 0.08);
      hotspot.scale.setScalar(baseScale * pulse);
      hotspot.material.opacity = 0.03 + intensity * 0.21 + Math.sin(timeSec * 1.6 + phase) * 0.012;
    }

    for (let i = 0; i < this.pulses.length; i += 1) {
      const pulse = this.pulses[i];
      const points = pulse.points;
      if (!points || points.length < 2) {
        continue;
      }

      const progress = (pulse.offset + timeSec * pulse.speed + pulse.phase) % 1;
      const idx = progress * (points.length - 1);
      const base = Math.floor(idx);
      const next = Math.min(points.length - 1, base + 1);
      const lerp = idx - base;

      pulse.mesh.position.copy(points[base]).lerp(points[next], lerp);
      pulse.mesh.scale.setScalar(1 + 0.18 * Math.sin((timeSec + pulse.phase) * 3.2));
      pulse.mesh.material.opacity = 0.48 + 0.2 * Math.sin((timeSec + pulse.phase) * 2.6);
    }
  }

  pickSignal(event) {
    const intersects = this.raycastMarkers(event);
    if (intersects.length) {
      const item = intersects[0].object?.userData?.item;
      return item || null;
    }

    const regionIntersects = this.raycastRegions(event);
    if (!regionIntersects.length) {
      return null;
    }

    const regionItems = regionIntersects[0].object?.userData?.items;
    if (!Array.isArray(regionItems) || regionItems.length === 0) {
      return null;
    }

    return regionItems[0] || null;
  }

  isHoveringMarker(event) {
    if (this.raycastMarkers(event).length > 0) {
      return true;
    }

    const regions = this.raycastRegions(event);
    if (!regions.length) {
      return false;
    }

    const regionItems = regions[0].object?.userData?.items;
    return Array.isArray(regionItems) && regionItems.length > 0;
  }

  raycastMarkers(event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.pointer.set(x, y);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObjects(this.interactiveMarkers, false);
  }

  raycastRegions(event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.pointer.set(x, y);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObjects(this.interactiveRegions, false);
  }
}

export function createGlobeRenderer(canvas, summaryElement, options = {}) {
  if (!canvas) {
    return {
      start() {},
      stop() {},
      destroy() {},
      setSignals() {},
      focusOnItem() {},
    };
  }

  const state = {
    instance: null,
    destroyed: false,
    shouldStart: false,
    queuedSignals: [],
    queuedFocus: null,
  };

  const wrapper = {
    start() {
      state.shouldStart = true;
      state.instance?.start();
    },
    stop() {
      state.shouldStart = false;
      state.instance?.stop();
    },
    destroy() {
      state.destroyed = true;
      state.instance?.destroy();
      state.instance = null;
    },
    setSignals(items) {
      state.queuedSignals = Array.isArray(items) ? items : [];
      state.instance?.setSignals(state.queuedSignals);
    },
    focusOnItem(item, filteredIndex = -1) {
      state.queuedFocus = item ? { item, filteredIndex } : null;
      state.instance?.focusOnItem(item, filteredIndex);
    },
  };

  (async () => {
    try {
      await ensureWebGlModules();
      if (state.destroyed) {
        return;
      }

      const instance = new GlobeRenderer(canvas, summaryElement, options);
      state.instance = instance;

      if (state.queuedSignals.length) {
        instance.setSignals(state.queuedSignals);
      }

      if (state.queuedFocus?.item) {
        instance.focusOnItem(state.queuedFocus.item, state.queuedFocus.filteredIndex);
      }

      if (state.shouldStart) {
        instance.start();
      }
    } catch (error) {
      console.error("[globe] WebGL initialization failed", error);
      if (summaryElement) {
        summaryElement.textContent = "WebGL unavailable";
      }
    }
  })();

  return wrapper;
}

