(() => {
  'use strict';
  // Small compatibility fixes kept outside the generated admin bundle.
  const originalEdit = window.hfkEditUpdate;
  if (typeof originalEdit === 'function') {
    window.hfkEditUpdate = id => {
      originalEdit(id);
      setTimeout(() => {
        const field = document.querySelector('#eacc');
        if (field && /^\$\{ESC\(ACCESSORIESTEXT\(U\.ACCESSORIES\)\)\}$/.test(field.value.trim())) {
          field.value = '';
        }
      }, 0);
    };
  }
})();
