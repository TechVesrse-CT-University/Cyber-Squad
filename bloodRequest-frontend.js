// Handle form submission and show popup
document.addEventListener('DOMContentLoaded', function() {
  const bloodForm = document.getElementById('bloodForm');
  
  if (bloodForm) {
    bloodForm.addEventListener('submit', function(e) {
      e.preventDefault();
      
      // Show popup
      window.open('poppup.html', 'popupWindow', 
                 'width=400,height=300,left=100,top=100');
      
      // Optional: Reset form after submission
      this.reset();
    });
  }
});
