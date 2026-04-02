import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

function FlowingData() {
  const count = 1200;
  const mesh = useRef<any>(null!);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  // High-intensity vibrant colors for additive blending
  const color1 = useMemo(() => new THREE.Color('#3b82f6'), []); // Deep blue
  const color2 = useMemo(() => new THREE.Color('#a855f7'), []); // Neon purple
  const tempColor = useMemo(() => new THREE.Color(), []);

  const particles = useMemo(() => {
    const temp = [];
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 50;
      const y = -25 + Math.random() * 50;
      const z = (Math.random() - 0.5) * 20;
      const speed = 0.02 + Math.random() * 0.05; // Much faster
      temp.push({ x, y, z, speed });
    }
    return temp;
  }, [count]);

  useFrame(() => {
    if (!mesh.current) return;

    particles.forEach((particle, i) => {
      particle.y += particle.speed;

      // Aggressive pull towards center to form a visible neural beam
      if (particle.y > -10 && particle.y < 10) {
        particle.x += (0 - particle.x) * 0.02;
        particle.z += (0 - particle.z) * 0.01;
      }

      if (particle.y > 25) {
        particle.y = -25;
        particle.x = (Math.random() - 0.5) * 50;
      }

      dummy.position.set(particle.x, particle.y, particle.z);

      // Scale them dramatically as they hit the processing center
      const scale = particle.y > -5 && particle.y < 5 ? 1.5 : 0.5;
      dummy.scale.set(scale, scale * 3, scale); // Stretch them like laser beams

      dummy.updateMatrix();
      mesh.current.setMatrixAt(i, dummy.matrix);

      // Color transition logic
      const mixRatio = Math.max(0, Math.min(1, (particle.y + 15) / 30));
      tempColor.copy(color1).lerp(color2, mixRatio);
      mesh.current.setColorAt(i, tempColor);
    });

    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) {
      mesh.current.instanceColor.needsUpdate = true;
    }
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]}>
      <circleGeometry args={[0.06, 8]} />
      {/* Additive blending makes particles glow fiercely when overlapping */}
      <meshBasicMaterial
        transparent
        opacity={0.8}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

export function ThreeBackground() {
  return (
    <div className="absolute inset-0 z-0 h-full w-full pointer-events-none opacity-80">
      <Canvas
        camera={{ position: [0, 0, 15], fov: 60 }}
        gl={{ antialias: true, alpha: true }}
      >
        <fog attach="fog" args={['#000000', 5, 25]} />
        <FlowingData />
      </Canvas>
      {/* Soft gradient mask to frame the insane particles */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,#000000_90%)]" />
    </div>
  );
}
