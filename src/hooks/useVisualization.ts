import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { vertexShader, fragmentShader } from '../utils/shaders';

export const useVisualization = (mountRef: React.RefObject<HTMLDivElement>, animationColor: string) => {
  const shaderMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    // Scene setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true, 
      alpha: true,
      premultipliedAlpha: true 
    });
    renderer.setSize(width, height);
    mountRef.current.appendChild(renderer.domElement);

    camera.position.z = 14;

    // Create particles
    const particleCount = 5000;
    const positions = new Float32Array(particleCount * 3);
    const normals = new Float32Array(particleCount * 3);

    // Create particle positions in a spherical formation
    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      const radius = 2;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos((Math.random() * 2) - 1);
      
      positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i3 + 2] = radius * Math.cos(phi);

      // Calculate normals (direction from center)
      const length = Math.sqrt(
        positions[i3] ** 2 + 
        positions[i3 + 1] ** 2 + 
        positions[i3 + 2] ** 2
      );
      normals[i3] = positions[i3] / length;
      normals[i3 + 1] = positions[i3 + 1] / length;
      normals[i3 + 2] = positions[i3 + 2] / length;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));

    // Updated material settings for particle effect
    const shaderMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        u_time: { value: 0.0 },
        u_amplitude: { value: 0.0 },
        u_explosiveness: { value: 0.0 },
        u_avgVolume: { value: 0.0 },
        u_color1: { value: new THREE.Color('#0066ff') }, // Blue
        u_color2: { value: new THREE.Color('#ff3333') }, // Red
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true
    });

    shaderMaterialRef.current = shaderMaterial;

    // Create points system instead of mesh
    const particles = new THREE.Points(geometry, shaderMaterial);
    particles.userData.clickable = true;
    scene.add(particles);

    // Audio setup
    const initAudio = async () => {
      try {
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        const newAnalyser = audioContextRef.current.createAnalyser();
        newAnalyser.fftSize = 256;

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const source = audioContextRef.current.createMediaStreamSource(stream);
        source.connect(newAnalyser);
        setAnalyser(newAnalyser);
      } catch (error) {
        console.error("Error accessing the microphone", error);
      }
    };

    // Initialize audio immediately
    initAudio();

    // Animation loop
    const animate = () => {
      const animationFrame = requestAnimationFrame(animate);
      shaderMaterial.uniforms.u_time.value += 0.01;

      // Rotate the particle system
      particles.rotation.y += 0.001;
      particles.rotation.x += 0.0005;

      if (analyser) {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
        const normalizedAverage = average / 255;

        // Define particle animation states
        const gentleFlow = () => {
          shaderMaterial.uniforms.u_avgVolume.value = normalizedAverage * 0.8;
          shaderMaterial.uniforms.u_amplitude.value = 0.4;
          shaderMaterial.uniforms.u_explosiveness.value = 0.2;
        };

        const moderateFlow = () => {
          shaderMaterial.uniforms.u_avgVolume.value = normalizedAverage;
          shaderMaterial.uniforms.u_amplitude.value = 0.6;
          shaderMaterial.uniforms.u_explosiveness.value = 0.4;
        };

        const intenseFlow = () => {
          shaderMaterial.uniforms.u_avgVolume.value = normalizedAverage * 1.2;
          shaderMaterial.uniforms.u_amplitude.value = 0.8;
          shaderMaterial.uniforms.u_explosiveness.value = 0.6;
        };

        // Choose animation state based on audio intensity
        if (normalizedAverage < 0.3) {
          gentleFlow();
        } else if (normalizedAverage < 0.6) {
          moderateFlow();
        } else {
          intenseFlow();
        }
      } else {
        shaderMaterial.uniforms.u_avgVolume.value = 0.0;
        shaderMaterial.uniforms.u_amplitude.value = 0.4;
        shaderMaterial.uniforms.u_explosiveness.value = 0.2;
      }

      renderer.render(scene, camera);
      return animationFrame;
    };

    const animationFrame = animate();

    // Click handler
    const onClick = async (event: MouseEvent) => {
      const canvas = renderer.domElement;
      const rect = canvas.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2(x, y);
      raycaster.setFromCamera(mouse, camera);

      const intersects = raycaster.intersectObjects(scene.children);
      if (intersects.length > 0 && intersects[0].object.userData.clickable) {
        await initAudio();
      }
    };

    renderer.domElement.addEventListener('click', onClick);

    // Resize handler
    const handleResize = () => {
      if (!mountRef.current) return;
      const width = mountRef.current.clientWidth;
      const height = mountRef.current.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('click', onClick);
      cancelAnimationFrame(animationFrame);
      mountRef.current?.removeChild(renderer.domElement);
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [animationColor]);

  return {
    shaderMaterialRef,
    analyser
  };
};
