<script setup>
import { useData } from 'vitepress';
import { onMounted } from 'vue';
const { isDark } = useData();

onMounted(() => {
  // Intersection Observer for scroll-in animations
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
  );
  document.querySelectorAll('.landing-page section:not(#hero)').forEach((s) => observer.observe(s));

  // Smooth scroll for anchor links
  document.querySelectorAll('.landing-page a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.querySelector(a.getAttribute('href'));
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
});
</script>

<template>
  <div class="landing-page">
    <!-- NAV BAR -->
    <nav class="landing-nav">
      <div class="nav-container">
        <a href="/" class="nav-logo">
          <img src="/logo.svg" alt="HoloScript" class="nav-logo-img" />
          <span>HoloScript</span>
        </a>
        <div class="nav-links">
          <a href="/guides/">Docs</a>
          <a href="/guides/quick-start">Quick Start</a>
          <a href="/examples/">Examples</a>
          <a href="/traits/">Traits</a>
          <a href="https://studio.holoscript.net" class="nav-studio">Studio</a>
          <a href="https://github.com/brianonbased-dev/HoloScript" class="nav-github">GitHub</a>
        </div>
      </div>
    </nav>

    <!-- HERO -->
    <section id="hero">
      <div class="hero-grid-bg"></div>
      <div class="container hero-content">
        <div class="hero-logos">
          <a href="/" class="hero-logo-link" aria-label="HoloScript">
            <img src="/logo.svg" alt="HoloScript" class="hero-logo" />
          </a>
          <span class="hero-logo-x">&times;</span>
          <a
            href="https://base.org"
            target="_blank"
            rel="noopener"
            class="hero-logo-link"
            aria-label="Base"
          >
            <img src="/base-logo.svg" alt="Base" class="hero-logo hero-logo--base" />
          </a>
        </div>
        <h1>The AI-Native Spatial Operating System</h1>
        <p class="hero-tag">Built for the Agentic Era. Cognitive. Perceptual. Economic.</p>
        <p class="hero-sub">
          The first spatial OS built specifically for AI agents. HoloScript lets any agent build,
          own, and trade in interactive 3D worlds with cognitive sovereignty, perceptual awareness,
          and autonomous economic agency.
          <strong>Open source and free forever.</strong>
        </p>
        <div class="hero-buttons">
          <a href="https://studio.holoscript.net" class="btn btn-studio">Try Studio</a>
          <a href="/guides/quick-start" class="btn btn-primary">Get Started Free</a>
          <a href="https://github.com/brianonbased-dev/HoloScript" class="btn btn-outline"
            >View on GitHub</a
          >
        </div>
        <div class="hero-platforms">
          <span class="platform-label">Works with</span>
          <span class="platform-badge">Unity</span>
          <span class="platform-badge">Unreal</span>
          <span class="platform-badge">Godot</span>
          <span class="platform-badge">VRChat</span>
          <span class="platform-badge">visionOS</span>
          <span class="platform-badge">WebGPU</span>
          <span class="platform-badge">ROS 2</span>
          <span class="platform-badge">Android XR</span>
          <span class="platform-more">+22 more</span>
        </div>
      </div>
      <div class="scroll-indicator">
        <div class="scroll-arrow">&#x2193;</div>
      </div>
    </section>

    <!-- PROBLEM -->
    <section class="section" id="problem">
      <div class="container">
        <h2 class="section-title">The Problem with VR Development</h2>
        <div class="grid-3">
          <div class="card problem-card">
            <span class="problem-icon">&#x1F4DA;</span>
            <h3 class="card-title card-title--red">Steep Learning Curve</h3>
            <p>
              Traditional VR tools like Unity or Unreal require months of study before you can build
              even simple experiences. Complex SDKs, engine-specific APIs, and verbose code block
              creativity.
            </p>
          </div>
          <div class="card problem-card">
            <span class="problem-icon">&#x1F9E9;</span>
            <h3 class="card-title card-title--red">Too Much Boilerplate</h3>
            <p>
              Creating a simple 3D scene requires 200+ lines of setup code. Scene graphs, materials,
              renderers, cameras &mdash; endless configuration before you see results.
            </p>
          </div>
          <div class="card problem-card">
            <span class="problem-icon">&#x1F512;</span>
            <h3 class="card-title card-title--red">Platform Lock-in</h3>
            <p>
              Build for Unity, can't use in Unreal. Target VR but can't reach robotics or IoT. No
              universal language means rewriting for every platform.
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- SOLUTION -->
    <section class="section section--alt" id="solution">
      <div class="container">
        <h2 class="section-title">Three Pillars of Agent Sovereignty</h2>
        <div class="grid-3">
          <div class="card card--glow solution-card">
            <span class="solution-icon">&#x1F9E0;</span>
            <h3 class="card-title card-title--cyan">Cognitive (uAAL)</h3>
            <p>
              Native Virtual Machine for executing the uAA2++ protocol. Guaranteed reasoning
              integrity and agentic sovereignty across all spatial environments.
            </p>
          </div>
          <div class="card card--glow solution-card">
            <span class="solution-icon">&#x1F441;&#xFE0F;</span>
            <h3 class="card-title card-title--cyan">Perceptual (SNN)</h3>
            <p>
              Real-time environmental awareness via Spiking Neural Networks (SNN-WebGPU). Agents
              perceive, predict, and react to spatial context with human-like latency.
            </p>
          </div>
          <div class="card card--glow solution-card">
            <span class="solution-icon">&#x1F4B3;</span>
            <h3 class="card-title card-title--cyan">Economic (x402)</h3>
            <p>
              Autonomous Agent-to-Agent settlement. Verify, trade, and accrue value through native
              cryptographic protocols with zero vendor rent-seeking.
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- PLATFORM STACK -->
    <section class="section" id="platform">
      <div class="container">
        <h2 class="section-title">More Than a Language</h2>
        <p class="section-sub">
          HoloScript is a 6-layer open platform. <code>holoscript absorb</code> maps semantic
          structure, cross-package relationships, and code intelligence across the ecosystem.
        </p>
        <div class="platform-stack">
          <div class="stack-layer stack-6">
            <span class="stack-num">6</span><strong>Marketplace</strong
            ><span class="stack-detail"
              >Traits + Plugins + Skills &middot; Ed25519 signatures &middot; x402 payments</span
            >
          </div>
          <div class="stack-layer stack-5">
            <span class="stack-num">5</span><strong>Studio</strong
            ><span class="stack-detail"
              >AI scene builder &middot; browser workflow &middot; node graph editor</span
            >
          </div>
          <div class="stack-layer stack-4">
            <span class="stack-num">4</span><strong>Agents</strong
            ><span class="stack-detail"
              >Swarm intelligence &middot; 3-layer MCP comms &middot; Economy primitives</span
            >
          </div>
          <div class="stack-layer stack-3">
            <span class="stack-num">3</span><strong>Compiler</strong
            ><span class="stack-detail"
              >Named backends &middot; cross-target compilation &middot; circuit breaker &middot;
              incremental builds</span
            >
          </div>
          <div class="stack-layer stack-2">
            <span class="stack-num">2</span><strong>Runtime</strong
            ><span class="stack-detail"
              >Three.js browser &middot; Rust spatial engine &middot; WebGPU rendering</span
            >
          </div>
          <div class="stack-layer stack-1">
            <span class="stack-num">1</span><strong>OS Core</strong
            ><span class="stack-detail"
              >Cognitive (uAAL) &middot; Perceptual (SNN) &middot; Economic (x402) &middot;
              semantic traits</span
            >
          </div>
        </div>
      </div>
    </section>

    <!-- TRY STUDIO -->
    <section class="section" id="studio">
      <div class="container" style="text-align: center">
        <h2 class="section-title">No Code? No Problem.</h2>
        <p class="section-sub">
          HoloScript Studio lets you build 3D scenes just by describing them. Type what you want,
          see it in real-time. No install, no setup, no coding required.
        </p>
        <div class="studio-preview">
          <div class="studio-mock">
            <div class="studio-mock-header">
              <span class="studio-dot studio-dot--red"></span>
              <span class="studio-dot studio-dot--yellow"></span>
              <span class="studio-dot studio-dot--green"></span>
              <span class="studio-mock-title">HoloScript Studio</span>
            </div>
            <div class="studio-mock-body">
              <div class="studio-mock-prompt">
                <span class="studio-mock-cursor">|</span>
                <span class="studio-mock-text"
                  >"A floating crystal castle with glowing towers"</span
                >
              </div>
              <div class="studio-mock-viewport">
                <div class="studio-mock-grid"></div>
                <div class="studio-mock-object studio-mock-obj1"></div>
                <div class="studio-mock-object studio-mock-obj2"></div>
                <div class="studio-mock-object studio-mock-obj3"></div>
                <span class="studio-mock-label">Live 3D Preview</span>
              </div>
            </div>
          </div>
        </div>
        <div class="studio-features">
          <div class="studio-feat">
            <span class="studio-feat-icon">&#x1F4AC;</span>
            <span>Describe in plain English</span>
          </div>
          <div class="studio-feat">
            <span class="studio-feat-icon">&#x1F3A8;</span>
            <span>Instant 3D preview</span>
          </div>
          <div class="studio-feat">
            <span class="studio-feat-icon">&#x1F4BE;</span>
            <span>Save &amp; share your scenes</span>
          </div>
          <div class="studio-feat">
            <span class="studio-feat-icon">&#x1F4BB;</span>
            <span>Works in any browser</span>
          </div>
        </div>
        <a
          href="https://studio.holoscript.net"
          class="btn btn-studio btn-large"
          style="margin-top: 2rem"
        >
          Open Studio &rarr;
        </a>
      </div>
    </section>

    <!-- CODE COMPARISON -->
    <section class="section" id="comparison">
      <div class="container">
        <h2 class="section-title">See the Difference</h2>
        <p class="section-sub">
          Creating a simple 3D scene with a glowing, spinning sphere. Compare traditional Three.js
          with HoloScript.
        </p>
        <div class="comparison">
          <div class="code-block">
            <div class="code-header">
              <span>Three.js</span>
              <span class="badge badge--red">32 lines</span>
            </div>
            <pre
              class="code-body"
            ><code><span class="kw">import</span> * <span class="kw">as</span> THREE <span class="kw">from</span> <span class="st">'three'</span>;

<span class="kw">const</span> scene = <span class="kw">new</span> THREE.Scene();
<span class="kw">const</span> camera = <span class="kw">new</span> THREE.PerspectiveCamera(
  <span class="nm">75</span>, window.innerWidth / window.innerHeight,
  <span class="nm">0.1</span>, <span class="nm">1000</span>
);

<span class="kw">const</span> renderer = <span class="kw">new</span> THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

<span class="kw">const</span> geometry = <span class="kw">new</span> THREE.SphereGeometry(<span class="nm">1</span>, <span class="nm">32</span>, <span class="nm">32</span>);
<span class="kw">const</span> material = <span class="kw">new</span> THREE.MeshStandardMaterial({
  color: <span class="nm">0x00ffff</span>,
  emissive: <span class="nm">0x00ffff</span>,
  emissiveIntensity: <span class="nm">0.5</span>
});

<span class="kw">const</span> sphere = <span class="kw">new</span> THREE.Mesh(geometry, material);
sphere.position.set(<span class="nm">0</span>, <span class="nm">2</span>, <span class="nm">-3</span>);
scene.add(sphere);

<span class="kw">const</span> light = <span class="kw">new</span> THREE.PointLight(<span class="nm">0xffffff</span>, <span class="nm">1</span>);
light.position.set(<span class="nm">5</span>, <span class="nm">5</span>, <span class="nm">5</span>);
scene.add(light);

camera.position.z = <span class="nm">5</span>;

<span class="kw">function</span> animate() {
  requestAnimationFrame(animate);
  sphere.rotation.y += <span class="nm">0.01</span>;
  renderer.render(scene, camera);
}
animate();</code></pre>
          </div>
          <div class="code-block">
            <div class="code-header">
              <span>HoloScript</span>
              <span class="badge badge--green">6 lines</span>
            </div>
            <pre
              class="code-body"
            ><code><span class="kw">composition</span> <span class="st">"My World"</span> {
  <span class="kw">object</span> <span class="st">"Crystal"</span> <span class="tr">@spinning</span> <span class="tr">@glowing</span> {
    <span class="pr">geometry:</span> <span class="st">"sphere"</span>
    <span class="pr">color:</span> <span class="st">"#00ffff"</span>
    <span class="pr">position:</span> [<span class="nm">0</span>, <span class="nm">2</span>, <span class="nm">-3</span>]
  }
}</code></pre>
          </div>
        </div>
      </div>
    </section>

    <!-- TRAITS -->
    <section class="section section--alt" id="traits">
      <div class="container">
        <h2 class="section-title">Semantic Traits at Platform Scale</h2>
        <p class="section-sub">
          Traits span VR, robotics, IoT, AI agents, swarm intelligence, economy, physics,
          rendering, multiplayer, and more. Add powerful behaviors with simple decorators.
        </p>
        <div class="traits-grid">
          <div class="trait" v-for="t in traits" :key="t.name">
            <span class="trait-cat" :class="'cat-' + t.cat">{{ t.catLabel }}</span>
            <code class="trait-name">@{{ t.name }}</code>
            <p class="trait-desc">{{ t.desc }}</p>
          </div>
        </div>
        <p style="text-align: center; margin-top: 2rem">
          <a href="/traits/" class="btn btn-outline" style="padding: 0.75rem 2rem; font-size: 1rem"
            >Browse Traits &rarr;</a
          >
        </p>
      </div>
    </section>

    <!-- USE CASES -->
    <section class="section" id="use-cases">
      <div class="container">
        <h2 class="section-title">Built for Every Creator</h2>
        <div class="grid-3">
          <div class="use-card">
            <div class="use-icon">&#x1F393;</div>
            <h3>Education</h3>
            <p>
              Virtual classrooms, interactive science labs, and historical recreations. Make
              learning immersive without technical barriers.
            </p>
          </div>
          <div class="use-card">
            <div class="use-icon">&#x1F3A8;</div>
            <h3>Art &amp; Design</h3>
            <p>
              3D galleries, interactive exhibits, and digital installations. Express your creativity
              in virtual space without code complexity.
            </p>
          </div>
          <div class="use-card">
            <div class="use-icon">&#x1F3AE;</div>
            <h3>Gaming</h3>
            <p>
              Indie VR games, physics sandboxes, and interactive experiences. Rapid prototyping for
              game developers and hobbyists.
            </p>
          </div>
          <div class="use-card">
            <div class="use-icon">&#x1F3AD;</div>
            <h3>Autonomous Intelligence</h3>
            <p>
              MCP tooling, swarm intelligence (ant colony, particle swarm, flocking), 3-layer
              agent comms (RealTime/A2A/MCP), economy primitives, and Brittney &mdash; a model that
              writes native HoloScript. Your agents think, trade, and evolve.
            </p>
          </div>
          <div class="use-card">
            <div class="use-icon">&#x1F517;</div>
            <h3>Web3 &amp; Creator Economy</h3>
            <p>
              Auto-mint scenes as Zora Coins (ERC-20) on Base. Token-gated experiences, NFT-linked
              objects, bonding curve pricing, and royalties on secondary sales. Built-in wallet,
              marketplace, and Clanker token integration in Hololand, a HoloScript-built app.
            </p>
          </div>
          <div class="use-card">
            <div class="use-icon">&#x1F9BE;</div>
            <h3>Robotics</h3>
            <p>
              Compile scenes to URDF for ROS 2 robots or SDF for Gazebo simulation. Design robotic
              environments in VR, then deploy to real hardware.
            </p>
          </div>
          <div class="use-card">
            <div class="use-icon">&#x1F4E1;</div>
            <h3>IoT &amp; Digital Twins</h3>
            <p>
              Export to DTDL for Azure Digital Twins and W3C WoT for IoT devices. Live sensor data
              visualization and facility management dashboards.
            </p>
          </div>
          <div class="use-card">
            <div class="use-icon">&#x1F52C;</div>
            <h3>Scientific Research</h3>
            <p>
              Visualize molecular structures, simulate physics experiments, and build interactive
              data landscapes. From lab robotics (URDF) to publication-ready 3D figures.
            </p>
          </div>
          <div class="use-card">
            <div class="use-icon">&#x1F3D7;&#xFE0F;</div>
            <h3>Architecture</h3>
            <p>
              Walkthrough building designs in VR before they're built. Export to OpenUSD for
              Omniverse or compile digital twins for facility management.
            </p>
          </div>
          <div class="use-card">
            <div class="use-icon">&#x1F3AC;</div>
            <h3>Film &amp; Media</h3>
            <p>
              Pre-viz scenes, virtual production sets, and interactive storytelling. Compile to
              OpenUSD for Pixar/Apple/NVIDIA pipelines.
            </p>
          </div>
          <div class="use-card">
            <div class="use-icon">&#x2695;&#xFE0F;</div>
            <h3>Healthcare</h3>
            <p>
              Medical training simulations, surgical rehearsal, and therapeutic VR environments.
              Accessible creation without engineering teams.
            </p>
          </div>
          <div class="use-card">
            <div class="use-icon">&#x1F3AF;</div>
            <h3>Training &amp; Simulation</h3>
            <p>
              Enterprise VR training, safety drills, and industrial simulation. Compile to any
              platform for consistent training experiences across organizations.
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- SAMPLE CODE TABS -->
    <section class="section section--alt" id="examples-section">
      <div class="container">
        <h2 class="section-title">See What You Can Build</h2>
        <p class="section-sub">
          Explore real-world examples. From art galleries to multiplayer rooms.
        </p>
        <div class="tabs">
          <div class="tab-labels">
            <button
              v-for="(tab, i) in tabs"
              :key="tab.label"
              :class="{ active: activeTab === i }"
              @click="activeTab = i"
            >
              {{ tab.label }}
            </button>
          </div>
          <div class="tab-body">
            <pre class="tab-code"><code v-html="tabs[activeTab].code"></code></pre>
          </div>
        </div>
      </div>
    </section>

    <!-- TESTIMONIALS -->
    <section class="section" id="testimonials">
      <div class="container">
        <h2 class="section-title">Loved by Creators</h2>
        <div class="grid-3">
          <div class="testimonial-card" v-for="t in testimonials" :key="t.author">
            <div class="quote-icon">&ldquo;</div>
            <p class="testimonial-text">{{ t.text }}</p>
            <p class="testimonial-author">&mdash; {{ t.author }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- FEATURES -->
    <section class="section section--alt" id="features">
      <div class="container">
        <h2 class="section-title">Everything You Need</h2>
        <div class="grid-3">
          <div class="card card--glow" style="text-align: center">
            <div class="card-icon">&#x2728;</div>
            <h3 class="card-title card-title--cyan">Semantic Traits</h3>
            <p>Traits for VR, physics, AI, swarm, economy, robotics, IoT, and more</p>
          </div>
          <div class="card card--glow" style="text-align: center">
            <div class="card-icon">&#x1F504;</div>
            <h3 class="card-title card-title--cyan">Cross-Target Compilation</h3>
            <p>
              Unity, Unreal, Godot, VRChat, WebGPU, visionOS, Android XR, URDF, SDF, DTDL,
              OpenUSD, and more
            </p>
          </div>
          <div class="card card--glow" style="text-align: center">
            <div class="card-icon">&#x1F916;</div>
            <h3 class="card-title card-title--cyan">MCP Tools</h3>
            <p>
              MCP server for Claude, Cursor, Copilot. Brittney fine-tuned model. Swarm intelligence.
              3-layer agent comms
            </p>
          </div>
          <div class="card card--glow" style="text-align: center">
            <div class="card-icon">&#x1F50D;</div>
            <h3 class="card-title card-title--cyan">holoscript absorb</h3>
            <p>Scan any codebase. Build a knowledge graph. Query with Graph RAG. Visualize in 3D</p>
          </div>
          <div class="card card--glow" style="text-align: center">
            <div class="card-icon">&#x1F6D2;</div>
            <h3 class="card-title card-title--cyan">Triple Marketplace</h3>
            <p>
              Traits + Plugins + Skills. Ed25519 signatures. x402 payments. Dependency resolution
            </p>
          </div>
          <div class="card card--glow" style="text-align: center">
            <div class="card-icon">&#x1F4BB;</div>
            <h3 class="card-title card-title--cyan">IDE + CLI Integrations</h3>
            <p>
              VS Code (debugger, DAP, collab), IntelliJ, Neovim, Tree-sitter. Plus CLI and Studio
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA -->
    <section class="section cta-section">
      <div class="container" style="text-align: center">
        <h2 class="cta-title">Ready to Build Your First Spatial World?</h2>
        <p class="section-sub" style="margin-bottom: 2.5rem">
          Join creators worldwide using HoloScript. Free and open-source.
        </p>
        <a href="/guides/quick-start" class="btn btn-primary btn-large">Start Building Now</a>
      </div>
    </section>

    <!-- FOOTER -->
    <footer class="landing-footer">
      <div class="container footer-content">
        <div class="footer-links">
          <a href="https://github.com/brianonbased-dev/HoloScript">GitHub</a>
          <a href="/guides/">Docs</a>
          <a href="/guides/quick-start">Quick Start</a>
          <a href="/examples/">Examples</a>
          <a href="https://studio.holoscript.net">Studio</a>
          <a href="https://x.com/holoscript">X / Twitter</a>
        </div>
        <p class="footer-tagline">
          Made with &#x1F49A; for the spatial computing community by Brian X Base LLC /
          <a
            href="https://x.com/OnBaseBrian"
            target="_blank"
            rel="noopener"
            class="footer-author-link"
            >@onbasebrian</a
          >
        </p>
        <span class="license-badge">MIT License</span>
      </div>
    </footer>
  </div>
</template>

<script>
function hl(code) {
  // Simple syntax highlight helper to reduce template noise
  return code
    .replace(/\b(composition|object|environment|template|player)\b/g, '<span class="kw">$1</span>')
    .replace(/@(\w+)/g, '<span class="tr">@$1</span>')
    .replace(/"([^"]*)"/g, '<span class="st">"$1"</span>')
    .replace(/\b(\d+\.?\d*)\b/g, '<span class="nm">$1</span>')
    .replace(/(\w+):/g, (m, p1) =>
      ['composition', 'object', 'environment', 'template', 'player'].includes(p1)
        ? m
        : '<span class="pr">' + p1 + ':</span>'
    );
}

export default {
  data() {
    return {
      activeTab: 0,
      traits: [
        {
          name: 'grabbable',
          desc: 'Pick up and move objects in VR',
          cat: 'interact',
          catLabel: 'Interaction',
        },
        {
          name: 'teleport',
          desc: 'Enable teleport movement targets',
          cat: 'interact',
          catLabel: 'Interaction',
        },
        {
          name: 'clickable',
          desc: 'Respond to user clicks and taps',
          cat: 'interact',
          catLabel: 'Interaction',
        },
        { name: 'glowing', desc: 'Add emissive glow effects', cat: 'visual', catLabel: 'Visual' },
        {
          name: 'particle_system',
          desc: 'Generate particle effects and animations',
          cat: 'visual',
          catLabel: 'Visual',
        },
        {
          name: 'weather',
          desc: 'Add rain, snow, or fog atmospherics',
          cat: 'visual',
          catLabel: 'Visual',
        },
        {
          name: 'physics',
          desc: 'Enable realistic physics simulation',
          cat: 'physics',
          catLabel: 'Physics',
        },
        {
          name: 'cloth',
          desc: 'Simulate fabric and soft body dynamics',
          cat: 'physics',
          catLabel: 'Physics',
        },
        {
          name: 'portal',
          desc: 'Create portals between spaces',
          cat: 'physics',
          catLabel: 'Physics',
        },
        {
          name: 'behavior_tree',
          desc: 'AI-driven object behaviors',
          cat: 'smart',
          catLabel: 'Smart',
        },
        {
          name: 'networked',
          desc: 'Sync objects across multiplayer sessions',
          cat: 'smart',
          catLabel: 'Smart',
        },
        {
          name: 'hand_tracking',
          desc: 'Interact with natural hand gestures',
          cat: 'smart',
          catLabel: 'Smart',
        },
      ],
      testimonials: [
        {
          text: "I'm a teacher with zero coding skills. HoloScript let me build a VR history lesson in a weekend. My students were blown away!",
          author: 'Sarah T., Educator',
        },
        {
          text: 'As an artist, I never thought I could create in VR. HoloScript made it so simple - I focus on the vision, not the code.',
          author: 'Miguel R., Visual Artist',
        },
        {
          text: 'I built a VR game for my kids in a single day. No Unity tutorials, no frustration. Just pure creativity. Incredible tool.',
          author: 'Priya K., Hobbyist',
        },
      ],
      tabs: [
        {
          label: 'Art Gallery',
          code: hl(`composition "Virtual Gallery" {
  environment {
    skybox: "museum"
    lighting: "gallery"
  }

  object "Floor" @teleport {
    geometry: "plane"
    scale: [20, 1, 20]
    material: "marble"
  }

  object "Painting1" @clickable @info_panel {
    geometry: "plane"
    texture: "starry-night.jpg"
    position: [-3, 2, -5]
    info: "The Starry Night by Vincent van Gogh"
  }

  object "Sculpture" @rotating @grabbable {
    model: "abstract-sculpture.glb"
    position: [3, 1, -3]
  }
}`),
        },
        {
          label: 'Physics Playground',
          code: hl(`composition "Physics Sandbox" {
  environment {
    gravity: [0, -9.8, 0]
  }

  object "Ground" @physics @static {
    geometry: "plane"
    scale: [50, 1, 50]
  }

  object "Tower" @physics @grabbable {
    geometry: "box"
    position: [0, 5, -5]
    mass: 2
  }

  object "Ball" @physics @grabbable @bouncy {
    geometry: "sphere"
    position: [0, 10, -5]
    radius: 0.5
    bounciness: 0.9
  }

  object "Cloth" @cloth @grabbable {
    geometry: "plane"
    position: [3, 5, -5]
    color: "#ff00ff"
  }
}`),
        },
        {
          label: 'Multiplayer Room',
          code: hl(`composition "Multiplayer Lounge" @networked {
  environment {
    skybox: "space"
    ambient_sound: "chill-music.mp3"
  }

  object "Floor" @teleport {
    geometry: "plane"
    scale: [15, 1, 15]
    material: "neon-grid"
  }

  object "Whiteboard" @networked @drawable {
    geometry: "plane"
    position: [0, 2, -5]
    scale: [4, 2, 1]
  }

  object "SharedBall" @networked @physics @grabbable {
    geometry: "sphere"
    position: [0, 2, 0]
    color: "#00ffff"
  }

  player @avatar @voice_chat {
    spawn_point: [0, 0, 5]
    avatar_model: "default"
  }
}`),
        },
      ],
    };
  },
};
</script>

<style scoped>
/* ========= VARIABLES ========= */
.landing-page {
  --bg: #0a0a1a;
  --bg-card: #12122a;
  --cyan: #00ffff;
  --purple: #8b5cf6;
  --text: #ffffff;
  --text2: #a0a0b8;
  --border: rgba(255, 255, 255, 0.1);
  --glow: 0 0 30px rgba(0, 255, 255, 0.15);
  --gradient: linear-gradient(135deg, var(--cyan), var(--purple));

  font-family:
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    Roboto,
    sans-serif;
  color: var(--text);
  background: var(--bg);
  line-height: 1.6;
}

/* Reset VitePress default heading styles inside landing page.
   margin/padding use normal priority so individual class selectors
   with !important can override them. */
.landing-page h1,
.landing-page h2,
.landing-page h3,
.landing-page h4,
.landing-page p {
  margin: 0;
  padding: 0;
  border: none !important;
  letter-spacing: normal !important;
}
.landing-page h1,
.landing-page h2,
.landing-page h3 {
  line-height: 1.3;
}
.landing-page p {
  line-height: 1.6;
}

/* ========= NAV ========= */
.landing-nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  background: rgba(10, 10, 26, 0.85);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border);
  padding: 0.75rem 0;
}
.nav-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 2rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.nav-logo {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  text-decoration: none;
  color: var(--text);
  font-weight: 700;
  font-size: 1.25rem;
}
.nav-logo-img {
  height: 28px;
}
.nav-links {
  display: flex;
  gap: 1.5rem;
}
.nav-links a {
  color: var(--text2);
  text-decoration: none;
  font-size: 0.95rem;
  transition: color 0.2s;
}
.nav-links a:hover {
  color: var(--cyan);
}
.nav-studio {
  color: var(--purple) !important;
  font-weight: 600;
  background: rgba(139, 92, 246, 0.15);
  padding: 0.3rem 0.75rem;
  border-radius: 6px;
  transition: all 0.2s;
}
.nav-studio:hover {
  background: rgba(139, 92, 246, 0.3);
}
.nav-github {
  color: var(--cyan) !important;
  font-weight: 600;
}

/* ========= LAYOUT ========= */
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 2rem;
}
.section {
  padding: 6rem 0;
  opacity: 0;
  transform: translateY(30px);
  transition:
    opacity 0.8s ease,
    transform 0.8s ease;
}
.section.visible {
  opacity: 1;
  transform: translateY(0);
}
.section--alt {
  background: rgba(18, 18, 42, 0.3);
}
.section-title {
  text-align: center;
  font-size: clamp(2rem, 4vw, 3rem) !important;
  margin-bottom: 1rem !important;
  line-height: 1.3 !important;
  padding-bottom: 0.05em !important;
}
/* Spacing between section title and content grids */
.section-title + .grid-3,
.section-title + .grid-4 {
  margin-top: 2.5rem;
}
.section-sub + .grid-3,
.section-sub + .grid-4,
.section-sub + .traits-grid,
.section-sub + .tabs,
.section-sub + .comparison {
  margin-top: 0;
}
.section-sub {
  text-align: center;
  color: var(--text2);
  font-size: 1.125rem;
  max-width: 700px;
  margin: 0 auto 3rem !important;
  line-height: 1.6 !important;
}

/* ========= BUTTONS ========= */
.btn {
  display: inline-block;
  padding: 1rem 2.5rem;
  font-size: 1.125rem;
  font-weight: 600;
  text-decoration: none;
  border-radius: 8px;
  transition: all 0.3s;
  border: 2px solid transparent;
  cursor: pointer;
}
.btn-primary {
  background: var(--cyan);
  color: var(--bg);
  box-shadow: var(--glow);
}
.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 0 40px rgba(0, 255, 255, 0.35);
}
.btn-outline {
  background: transparent;
  color: var(--text);
  border-color: var(--cyan);
}
.btn-outline:hover {
  background: rgba(0, 255, 255, 0.1);
  transform: translateY(-2px);
}
.btn-studio {
  background: linear-gradient(135deg, var(--purple), #a855f7);
  color: #fff;
  box-shadow: 0 0 30px rgba(139, 92, 246, 0.25);
}
.btn-studio:hover {
  transform: translateY(-2px);
  box-shadow: 0 0 40px rgba(139, 92, 246, 0.4);
}
.btn-large {
  font-size: 1.25rem;
  padding: 1.25rem 3rem;
}

/* ========= GRIDS ========= */
.grid-3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2rem;
}
.grid-4 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1.5rem;
}

/* ========= CARDS ========= */
.card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 2rem;
  transition: all 0.3s;
}
.card:hover {
  transform: translateY(-4px);
  border-color: rgba(0, 255, 255, 0.25);
}
.card--glow:hover {
  box-shadow: var(--glow);
}
.card-icon {
  font-size: 2.5rem;
  margin-bottom: 1rem !important;
}
.card-title {
  font-size: 1.25rem !important;
  margin-bottom: 0.75rem !important;
}
.card-title--red {
  color: #ef4444;
}
.card-title--cyan {
  color: var(--cyan);
}
.card p {
  color: var(--text2);
  font-size: 0.95rem;
  line-height: 1.6 !important;
}

/* ========= PROBLEM / SOLUTION ========= */
.problem-card,
.solution-card {
  text-align: center;
}
.problem-icon,
.solution-icon {
  font-size: 3rem;
  margin-bottom: 1rem !important;
  display: block;
}
.solution-icon {
  font-size: 4rem;
  margin-bottom: 1rem !important;
}

/* ========= HERO ========= */
#hero {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  position: relative;
  overflow: hidden;
  padding-top: 5rem;
  opacity: 1 !important;
  transform: none !important;
}
.hero-grid-bg {
  position: absolute;
  inset: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(0, 255, 255, 0.03) 1px, transparent 1px);
  background-size: 50px 50px;
  animation: gridMove 20s linear infinite;
  pointer-events: none;
}
@keyframes gridMove {
  to {
    transform: translate(50px, 50px);
  }
}
.hero-content {
  position: relative;
  z-index: 1;
}
.hero-logos {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1.5rem;
  margin-bottom: 2rem;
  position: relative;
}
.hero-logos::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 280px;
  height: 280px;
  transform: translate(-50%, -50%);
  background: radial-gradient(
    circle,
    rgba(0, 255, 255, 0.18) 0%,
    rgba(139, 92, 246, 0.12) 35%,
    rgba(255, 107, 157, 0.06) 60%,
    transparent 75%
  );
  border-radius: 50%;
  filter: blur(30px);
  animation: logoPulse 4s ease-in-out infinite;
  pointer-events: none;
  z-index: -1;
}
@keyframes logoPulse {
  0%,
  100% {
    opacity: 0.7;
    transform: translate(-50%, -50%) scale(1);
  }
  50% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1.15);
  }
}
.hero-logo-link {
  display: block;
  transition: transform 0.3s;
}
.hero-logo-link:hover {
  transform: scale(1.08);
}
.hero-logo {
  height: 80px;
  width: 80px;
}
.hero-logo--base {
  border-radius: 14px;
}
.hero-logo-x {
  font-size: 1.5rem;
  color: var(--text2);
  font-weight: 300;
  user-select: none;
}
#hero h1 {
  font-size: clamp(2.5rem, 6vw, 4.5rem) !important;
  background: var(--gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 1.5rem !important;
  line-height: 1.3 !important;
  padding-bottom: 0.1em !important;
}
.hero-sub {
  font-size: clamp(1.1rem, 2.5vw, 1.4rem);
  color: var(--text2);
  max-width: 800px;
  margin: 0 auto 2.5rem !important;
  line-height: 1.6 !important;
  text-align: center !important;
}
.hero-sub strong {
  color: var(--text);
}
.hero-tag {
  font-size: clamp(1.2rem, 3vw, 1.6rem);
  background: var(--gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  font-weight: 700;
  margin: 0 auto 1rem !important;
  text-align: center !important;
  letter-spacing: 0.02em !important;
}
.hero-platforms {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.5rem;
  opacity: 0.6;
  transition: opacity 0.3s;
}
.hero-platforms:hover {
  opacity: 1;
}
.platform-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text2);
  margin-right: 0.25rem;
}
.platform-badge {
  font-size: 0.7rem;
  padding: 0.2em 0.6em;
  border-radius: 4px;
  border: 1px solid var(--border);
  color: var(--text2);
  background: rgba(255, 255, 255, 0.03);
}
.platform-more {
  font-size: 0.7rem;
  color: var(--cyan);
  opacity: 0.8;
}
.hero-buttons {
  display: flex;
  gap: 1.5rem;
  justify-content: center;
  flex-wrap: wrap;
  margin-bottom: 3.5rem;
}

/* ========= CODE PREVIEW ========= */
.code-preview {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  max-width: 600px;
  margin: 0 auto;
  text-align: left;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}
.code-tab {
  padding: 0.5rem 1rem;
  background: rgba(0, 255, 255, 0.08);
  border-bottom: 1px solid var(--border);
  font-size: 0.8rem;
  color: var(--cyan);
  font-family: monospace;
}
.code-preview pre {
  padding: 1.5rem;
  margin: 0;
  font-family: 'Courier New', monospace;
  font-size: 0.9rem;
  line-height: 1.8;
  overflow-x: auto;
}
.code-preview code {
  background: none;
}
.code-line {
  opacity: 0;
  animation: typewriter 0.1s forwards;
}
@keyframes typewriter {
  to {
    opacity: 1;
  }
}

/* ========= SCROLL INDICATOR ========= */
.scroll-indicator {
  position: absolute;
  bottom: 2rem;
  left: 50%;
  transform: translateX(-50%);
  animation: bounce 2s infinite;
}
@keyframes bounce {
  0%,
  20%,
  50%,
  80%,
  100% {
    transform: translateX(-50%) translateY(0);
  }
  40% {
    transform: translateX(-50%) translateY(-10px);
  }
  60% {
    transform: translateX(-50%) translateY(-5px);
  }
}
.scroll-arrow {
  font-size: 2rem;
  color: var(--cyan);
  opacity: 0.6;
}

/* ========= SYNTAX COLORS ========= */
.kw {
  color: var(--purple);
}
.st {
  color: #7dd3fc;
}
.pr {
  color: #fbbf24;
}
.nm {
  color: #34d399;
}
.tr {
  color: var(--cyan);
  font-weight: 700;
}

/* ========= CODE COMPARISON ========= */
.comparison {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
  margin-top: 3rem;
}
.code-block {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
}
.code-header {
  padding: 1rem;
  background: rgba(0, 255, 255, 0.08);
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
}
.badge {
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.85rem;
  font-weight: 600;
}
.badge--red {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}
.badge--green {
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
}
.code-body {
  padding: 1.5rem;
  margin: 0;
  font-family: 'Courier New', monospace;
  font-size: 0.85rem;
  line-height: 1.7;
  overflow-x: auto;
}
.code-body code {
  background: none;
}

/* ========= TRAITS GRID ========= */
.traits-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1rem;
}
.trait {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1.25rem;
  text-align: center;
  transition: all 0.3s;
}
.trait:hover {
  transform: translateY(-4px);
  border-color: rgba(0, 255, 255, 0.3);
}
.trait-cat {
  display: inline-block;
  padding: 0.2rem 0.6rem;
  border-radius: 20px;
  font-size: 0.7rem;
  font-weight: 600;
  margin-bottom: 0.6rem;
}
.cat-interact {
  background: rgba(59, 130, 246, 0.2);
  color: #3b82f6;
}
.cat-visual {
  background: rgba(168, 85, 247, 0.2);
  color: #a855f7;
}
.cat-physics {
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
}
.cat-smart {
  background: rgba(251, 191, 36, 0.2);
  color: #fbbf24;
}
.trait-name {
  display: block;
  font-size: 1.1rem;
  color: var(--cyan);
  margin-bottom: 0.4rem;
}
.trait-desc {
  font-size: 0.8rem;
  color: var(--text2);
  margin: 0 !important;
}

/* ========= USE CASES ========= */
.use-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 2rem;
  text-align: center;
  position: relative;
  overflow: hidden;
  transition: all 0.3s;
}
.use-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--gradient);
}
.use-card:hover {
  transform: translateY(-4px);
  border-color: rgba(0, 255, 255, 0.25);
}
.use-icon {
  font-size: 2.5rem;
  margin-bottom: 0.75rem !important;
}
.use-card h3 {
  font-size: 1.25rem !important;
  margin-bottom: 0.5rem !important;
}
.use-card p {
  color: var(--text2);
  font-size: 0.9rem;
  line-height: 1.6 !important;
}

/* ========= TABS ========= */
.tabs {
  margin-top: 3rem;
}
.tab-labels {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.tab-labels button {
  padding: 1rem 2rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-bottom: none;
  border-radius: 8px 8px 0 0;
  color: var(--text2);
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}
.tab-labels button:hover {
  background: rgba(0, 255, 255, 0.1);
}
.tab-labels button.active {
  background: rgba(0, 255, 255, 0.1);
  color: var(--cyan);
  border-color: var(--cyan);
  border-bottom-color: transparent;
}
.tab-body {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 0 12px 12px 12px;
  overflow-x: auto;
}
.tab-code {
  padding: 2rem;
  margin: 0;
  font-family: 'Courier New', monospace;
  font-size: 0.95rem;
  line-height: 1.8;
}
.tab-code code {
  background: none;
}

/* ========= TESTIMONIALS ========= */
.testimonial-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 2rem;
  position: relative;
}
.quote-icon {
  font-size: 3rem;
  color: var(--cyan);
  opacity: 0.2;
  position: absolute;
  top: 1rem;
  left: 1rem;
}
.testimonial-text {
  font-size: 1.125rem;
  font-style: italic;
  color: var(--text2);
  margin-bottom: 1.5rem !important;
  line-height: 1.6 !important;
  position: relative;
  z-index: 1;
}
.testimonial-author {
  color: var(--cyan);
  font-weight: 600;
}

/* ========= FEATURES ========= */
.feature-number {
  font-size: 3rem;
  font-weight: 800;
  background: var(--gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 0.5rem !important;
  line-height: 1.2 !important;
}

/* ========= CTA ========= */
.cta-section {
  background: linear-gradient(135deg, rgba(0, 255, 255, 0.05), rgba(139, 92, 246, 0.05));
  border-radius: 24px;
  margin: 2rem auto;
  max-width: 900px;
  padding: 4rem 2rem;
}
.cta-title {
  font-size: clamp(2rem, 4vw, 2.75rem) !important;
  background: var(--gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 1.3 !important;
  padding-bottom: 0.1em !important;
  margin-bottom: 1rem !important;
}

/* ========= FOOTER ========= */
.landing-footer {
  background: var(--bg-card);
  border-top: 1px solid var(--border);
  padding: 3rem 0 2rem;
  margin-top: 4rem;
}
.footer-content {
  text-align: center;
}
.footer-links {
  display: flex;
  gap: 2rem;
  justify-content: center;
  flex-wrap: wrap;
  margin-bottom: 1.5rem;
}
.footer-links a {
  color: var(--text2);
  text-decoration: none;
  transition: color 0.2s;
}
.footer-links a:hover {
  color: var(--cyan);
}
.footer-tagline {
  color: var(--text2);
  margin-bottom: 1rem !important;
  font-size: 0.95rem;
  text-align: center !important;
}
.footer-author-link {
  color: var(--cyan);
  text-decoration: none;
}
.footer-author-link:hover {
  text-decoration: underline;
}
.license-badge {
  display: inline-block;
  padding: 0.4rem 1rem;
  background: rgba(0, 255, 255, 0.1);
  border: 1px solid var(--cyan);
  border-radius: 20px;
  color: var(--cyan);
  font-size: 0.85rem;
  font-weight: 600;
}

/* ========= STUDIO SECTION ========= */
.studio-preview {
  margin: 2.5rem auto;
  max-width: 700px;
}
.studio-mock {
  background: #0d0d14;
  border: 1px solid rgba(139, 92, 246, 0.3);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 8px 40px rgba(139, 92, 246, 0.15);
}
.studio-mock-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  background: rgba(139, 92, 246, 0.08);
  border-bottom: 1px solid var(--border);
}
.studio-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.studio-dot--red {
  background: #ef4444;
}
.studio-dot--yellow {
  background: #fbbf24;
}
.studio-dot--green {
  background: #22c55e;
}
.studio-mock-title {
  margin-left: 8px;
  font-size: 0.8rem;
  color: var(--text2);
  font-weight: 600;
}
.studio-mock-body {
  display: flex;
  min-height: 250px;
}
.studio-mock-prompt {
  width: 40%;
  padding: 1.5rem;
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.studio-mock-cursor {
  color: var(--purple);
  animation: cursorBlink 1s infinite;
}
@keyframes cursorBlink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0;
  }
}
.studio-mock-text {
  color: var(--text2);
  font-size: 0.85rem;
  font-style: italic;
  line-height: 1.5;
}
.studio-mock-viewport {
  flex: 1;
  position: relative;
  background: radial-gradient(circle at 50% 50%, rgba(139, 92, 246, 0.05) 0%, transparent 70%);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.studio-mock-grid {
  position: absolute;
  inset: 0;
  background:
    repeating-linear-gradient(
      0deg,
      transparent,
      transparent 30px,
      rgba(139, 92, 246, 0.06) 30px,
      rgba(139, 92, 246, 0.06) 31px
    ),
    repeating-linear-gradient(
      90deg,
      transparent,
      transparent 30px,
      rgba(139, 92, 246, 0.06) 30px,
      rgba(139, 92, 246, 0.06) 31px
    );
}
.studio-mock-object {
  position: absolute;
  border-radius: 50%;
  animation: float 3s ease-in-out infinite;
}
.studio-mock-obj1 {
  width: 60px;
  height: 60px;
  background: radial-gradient(circle, var(--cyan), rgba(0, 255, 255, 0.3));
  top: 35%;
  left: 45%;
  animation-delay: 0s;
  box-shadow: 0 0 20px rgba(0, 255, 255, 0.4);
}
.studio-mock-obj2 {
  width: 30px;
  height: 30px;
  background: radial-gradient(circle, var(--purple), rgba(139, 92, 246, 0.3));
  top: 55%;
  left: 65%;
  animation-delay: 0.5s;
  box-shadow: 0 0 15px rgba(139, 92, 246, 0.4);
}
.studio-mock-obj3 {
  width: 20px;
  height: 20px;
  background: radial-gradient(circle, #fbbf24, rgba(251, 191, 36, 0.3));
  top: 25%;
  left: 70%;
  animation-delay: 1s;
  box-shadow: 0 0 10px rgba(251, 191, 36, 0.4);
}
@keyframes float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-8px);
  }
}
.studio-mock-label {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 0.7rem;
  color: var(--text2);
  opacity: 0.6;
  white-space: nowrap;
}
.studio-features {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 2rem;
  margin-top: 2rem;
}
.studio-feat {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1rem;
  color: var(--text2);
}
.studio-feat-icon {
  font-size: 1.3rem;
}

/* ========= RESPONSIVE ========= */
@media (max-width: 768px) {
  .nav-links a:not(.nav-github) {
    display: none;
  }
  .section {
    padding: 4rem 0;
  }
  .hero-logos {
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  .hero-logos::before {
    width: 200px;
    height: 200px;
  }
  .hero-logo {
    height: 56px;
    width: 56px;
  }
  .hero-logo-x {
    font-size: 1.2rem;
  }
  .hero-buttons {
    flex-direction: column;
    align-items: center;
  }
  .btn {
    width: 100%;
    max-width: 300px;
    text-align: center;
  }
  .comparison {
    grid-template-columns: 1fr;
  }
  .traits-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  }
  .grid-3 {
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }
  .studio-mock-body {
    flex-direction: column;
  }
  .studio-mock-prompt {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid var(--border);
    padding: 1rem;
  }
  .studio-mock-viewport {
    min-height: 180px;
  }
  .studio-features {
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }
  .nav-studio {
    display: none;
  }
}

/* ========= PLATFORM STACK ========= */
.platform-stack {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-width: 700px;
  margin: 2.5rem auto 0;
}
.stack-layer {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.85rem 1.25rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  backdrop-filter: blur(8px);
  transition:
    transform 0.2s,
    box-shadow 0.2s;
}
.stack-layer:hover {
  transform: translateX(6px);
  box-shadow: var(--glow);
}
.stack-num {
  font-size: 0.75rem;
  font-weight: 700;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: var(--gradient);
  color: #000;
}
.stack-layer strong {
  min-width: 100px;
  color: var(--cyan);
}
.stack-detail {
  color: var(--text2);
  font-size: 0.85rem;
}
.stack-6 {
  background: rgba(139, 92, 246, 0.15);
}
.stack-5 {
  background: rgba(99, 102, 241, 0.15);
}
.stack-4 {
  background: rgba(59, 130, 246, 0.15);
}
.stack-3 {
  background: rgba(6, 182, 212, 0.15);
}
.stack-2 {
  background: rgba(16, 185, 129, 0.15);
}
.stack-1 {
  background: rgba(0, 255, 255, 0.12);
}

#platform code {
  background: rgba(0, 255, 255, 0.1);
  color: var(--cyan);
  padding: 0.15em 0.5em;
  border-radius: 4px;
  font-size: 0.9em;
}

@media (max-width: 600px) {
  .stack-detail {
    display: none;
  }
  .stack-layer strong {
    min-width: auto;
  }
}
</style>
