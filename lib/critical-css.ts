// Critical CSS for above-the-fold content
export const criticalCSS = `
  /* Reset and base styles */
  *, ::before, ::after {
    box-sizing: border-box;
    border-width: 0;
    border-style: solid;
    border-color: currentColor;
  }
  
  html {
    line-height: 1.5;
    -webkit-text-size-adjust: 100%;
    -moz-tab-size: 4;
    tab-size: 4;
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif;
  }
  
  body {
    margin: 0;
    line-height: inherit;
    min-height: 100vh;
  }
  
  /* Critical layout styles */
  .min-h-screen {
    min-height: 100vh;
  }
  
  .gradient-surface {
    background: linear-gradient(135deg, hsl(245 50% 98%) 0%, hsl(240 50% 96%) 100%);
  }
  
  .mobile-container-full {
    width: 100%;
    max-width: 80rem;
    margin-left: auto;
    margin-right: auto;
    padding-left: 1rem;
    padding-right: 1rem;
    min-height: 100vh;
  }
  
  .mobile-space-y {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  
  .mobile-space-y > * {
    min-height: 1rem;
  }
  
  /* Critical card styles */
  .glass-card {
    backdrop-filter: blur(20px) saturate(180%);
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 0.75rem;
  }
  
  .shadow-medium {
    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -1px rgb(0 0 0 / 0.06);
  }
  
  /* Critical text styles */
  .gradient-text {
    background: linear-gradient(135deg, hsl(240 100% 67%) 0%, hsl(280 100% 70%) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  
  /* Critical grid styles */
  .mobile-grid-stats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }
  
  @media (min-width: 768px) {
    .mobile-grid-stats {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
  
  /* Critical animation */
  .animate-fade-in-up {
    animation: fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1);
  }
  
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  /* Loading state */
  .animate-spin {
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
  
  /* Skeleton loader styles */
  .animate-pulse {
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }
  
  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: .5;
    }
  }
`;