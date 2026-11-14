'use client';

import dynamic from 'next/dynamic';

// three.js + WebXR only run in the browser
const LunarExperience = dynamic(() => import('./LunarExperience'), { ssr: false });

export default function ExperienceClient() {
  return <LunarExperience />;
}
