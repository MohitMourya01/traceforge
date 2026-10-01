import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, MeshDistortMaterial } from '@react-three/drei';
import * as THREE from 'three';

/* ── Floating Cyber Particles ────────────────────────────────────────────── */
function CyberParticles({ count = 120 }) {
  const meshRef = useRef();

  const particles = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    const colorPalette = [
      new THREE.Color('#ff2d55'),  // Crimson Pink
      new THREE.Color('#ff6b35'),  // Warm Orange
      new THREE.Color('#ff0844'),  // Hot Pink
      new THREE.Color('#8b1a4a'),  // Deep Magenta
      new THREE.Color('#ff4466'),  // Rose
      new THREE.Color('#cc2255'),  // Dark Rose
    ];

    for (let i = 0; i < count; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * 20;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 14;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 10 - 3;

      const color = colorPalette[Math.floor(Math.random() * colorPalette.length)];
      colors[i * 3]     = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;

      sizes[i] = Math.random() * 0.04 + 0.01;
    }

    return { positions, colors, sizes };
  }, [count]);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();
    const posArr = meshRef.current.geometry.attributes.position.array;

    for (let i = 0; i < count; i++) {
      posArr[i * 3 + 1] += Math.sin(t * 0.3 + i * 0.5) * 0.001;
      posArr[i * 3]     += Math.cos(t * 0.2 + i * 0.3) * 0.0005;
    }
    meshRef.current.geometry.attributes.position.needsUpdate = true;
    meshRef.current.rotation.y = t * 0.015;
  });

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          array={particles.positions}
          count={count}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          array={particles.colors}
          count={count}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.04}
        vertexColors
        transparent
        opacity={0.6}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

/* ── Glowing Orb ─────────────────────────────────────────────────────────── */
function GlowOrb({ position, color, speed = 1, distort = 0.3, size = 0.6 }) {
  const meshRef = useRef();

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime() * speed;
    meshRef.current.position.y = position[1] + Math.sin(t) * 0.3;
    meshRef.current.position.x = position[0] + Math.cos(t * 0.7) * 0.15;
  });

  return (
    <mesh ref={meshRef} position={position}>
      <sphereGeometry args={[size, 32, 32]} />
      <MeshDistortMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.4}
        transparent
        opacity={0.15}
        distort={distort}
        speed={2}
        roughness={0.2}
      />
    </mesh>
  );
}

/* ── Grid Floor ──────────────────────────────────────────────────────────── */
function CyberGrid() {
  const gridRef = useRef();

  useFrame(({ clock }) => {
    if (!gridRef.current) return;
    gridRef.current.material.uniforms.uTime.value = clock.getElapsedTime();
  });

  const gridShader = useMemo(() => ({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color('#ff2d55') },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      varying vec2 vUv;
      
      void main() {
        vec2 grid = abs(fract(vUv * 20.0 - 0.5) - 0.5) / fwidth(vUv * 20.0);
        float line = min(grid.x, grid.y);
        float gridLine = 1.0 - min(line, 1.0);
        
        float pulse = sin(vUv.y * 10.0 - uTime * 0.5) * 0.5 + 0.5;
        float fade = smoothstep(1.0, 0.0, vUv.y) * 0.6;
        
        float alpha = gridLine * fade * (0.15 + pulse * 0.1);
        
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), []);

  return (
    <mesh ref={gridRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -4, -5]}>
      <planeGeometry args={[30, 20, 1, 1]} />
      <shaderMaterial {...gridShader} />
    </mesh>
  );
}

/* ── Floating Shield ─────────────────────────────────────────────────────── */
function FloatingShield() {
  const shieldRef = useRef();

  useFrame(({ clock }) => {
    if (!shieldRef.current) return;
    const t = clock.getElapsedTime();
    shieldRef.current.rotation.y = t * 0.3;
    shieldRef.current.rotation.z = Math.sin(t * 0.5) * 0.1;
  });

  return (
    <Float speed={1.5} rotationIntensity={0.3} floatIntensity={0.5}>
      <group ref={shieldRef} position={[5.5, 1.2, -4]} scale={0.5}>
        {/* Shield outer ring */}
        <mesh>
          <torusGeometry args={[1.2, 0.06, 16, 64]} />
          <meshStandardMaterial
            color="#ff2d55"
            emissive="#ff2d55"
            emissiveIntensity={0.8}
            transparent
            opacity={0.6}
          />
        </mesh>
        {/* Shield inner ring */}
        <mesh>
          <torusGeometry args={[0.8, 0.04, 16, 48]} />
          <meshStandardMaterial
            color="#ff6b35"
            emissive="#ff6b35"
            emissiveIntensity={0.6}
            transparent
            opacity={0.4}
          />
        </mesh>
        {/* Shield center */}
        <mesh>
          <sphereGeometry args={[0.3, 32, 32]} />
          <MeshDistortMaterial
            color="#ff0844"
            emissive="#ff0844"
            emissiveIntensity={1.0}
            transparent
            opacity={0.35}
            distort={0.4}
            speed={3}
          />
        </mesh>
      </group>
    </Float>
  );
}

/* ── Main Background Component ───────────────────────────────────────────── */
export function CyberBackground() {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 0,
        pointerEvents: 'none',
      }}
    >
      <Canvas
        camera={{ position: [0, 0, 6], fov: 55 }}
        dpr={[1, 1.5]}
        gl={{ 
          antialias: false, 
          alpha: true,
          powerPreference: 'low-power',
        }}
        style={{ background: 'transparent' }}
      >
        {/* Ambient glow */}
        <ambientLight intensity={0.2} />
        <pointLight position={[-6, 4, 3]} color="#ff2d55" intensity={0.8} distance={15} />
        <pointLight position={[6, -2, 2]} color="#ff6b35" intensity={0.5} distance={12} />
        <pointLight position={[0, 3, -5]} color="#8b1a4a" intensity={0.4} distance={10} />

        {/* Floating cyber orbs */}
        <GlowOrb position={[-5, 2, -6]} color="#ff2d55" speed={0.6} distort={0.4} size={1.2} />
        <GlowOrb position={[4, -1, -5]} color="#ff6b35" speed={0.8} distort={0.3} size={0.8} />
        <GlowOrb position={[-2, -3, -7]} color="#8b1a4a" speed={0.4} distort={0.5} size={1.0} />
        <GlowOrb position={[6, 3, -8]} color="#ff0844" speed={0.5} distort={0.2} size={0.6} />

        {/* Grid floor */}
        <CyberGrid />

        {/* Floating shield decoration */}
        <FloatingShield />

        {/* Particle field */}
        <CyberParticles count={100} />
      </Canvas>
    </div>
  );
}
