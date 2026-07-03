// Spawns a radial "ripple" inside interactive elements at the pointer-down
// position. Styled by .ripple in styles.css; the host elements carry
// position:relative + overflow:hidden there.
const RIPPLE_TARGETS = '.btn, .client-item, .chip';

document.addEventListener('pointerdown', (e) => {
  const host = (e.target as Element | null)?.closest?.(RIPPLE_TARGETS);
  if (!(host instanceof HTMLElement)) return;

  const rect = host.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 2;
  const ripple = document.createElement('span');
  ripple.className = 'ripple';
  ripple.style.width = `${size}px`;
  ripple.style.height = `${size}px`;
  ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
  ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
  host.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove());
});

export {};
