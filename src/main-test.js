import './app.css'
import Test from './Test.svelte'

function mount() {
  const target = document.getElementById('app');
  if (!target) {
    console.error('Could not find #app element');
    return;
  }
  
  const app = new Test({
    target: target,
  });
  
  return app;
}

// Ensure DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}

export default mount()