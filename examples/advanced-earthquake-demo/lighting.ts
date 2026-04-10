import * as THREE from 'three';

export function setupLighting(scene: THREE.Scene): void {
  // Ambient light
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambientLight);

  // Directional light (sun)
  const sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
  sunLight.position.set(50, 100, 50);
  sunLight.castShadow = true;
  sunLight.shadow.camera.left = -100;
  sunLight.shadow.camera.right = 100;
  sunLight.shadow.camera.top = 100;
  sunLight.shadow.camera.bottom = -100;
  sunLight.shadow.mapSize.set(2048, 2048);
  scene.add(sunLight);

  // Hemisphere light for sky/ground color
  const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x8b7355, 0.3);
  scene.add(hemiLight);
}

export function setupGround(scene: THREE.Scene): void {
  const groundGeometry = new THREE.PlaneGeometry(400, 400);
  const groundMaterial = new THREE.MeshStandardMaterial({
    color: 0x3a5f0b,
    roughness: 0.9,
    metalness: 0.1,
  });

  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
}
