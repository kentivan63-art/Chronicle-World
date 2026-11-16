import React, { useEffect, useRef } from 'react';

interface PixelSpriteIconProps {
  sprite: HTMLCanvasElement;
  size?: number;
  className?: string;
  title?: string;
}

export const PixelSpriteIcon: React.FC<PixelSpriteIconProps> = ({
  sprite,
  size = 24,
  className = '',
  title,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = sprite.width;
    canvas.height = sprite.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(sprite, 0, 0);
  }, [sprite]);

  return (
    <canvas
      ref={canvasRef}
      title={title}
      style={{ width: size, height: size, imageRendering: 'pixelated' }}
      className={`shrink-0 ${className}`}
    />
  );
};
