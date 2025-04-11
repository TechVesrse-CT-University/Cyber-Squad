// Handle click on "Post a Blood request" list item
document.addEventListener('DOMContentLoaded', function() {
  const bloodRequestItem = document.querySelector('.steps:nth-child(2)');
  
  if (bloodRequestItem) {
    bloodRequestItem.addEventListener('click', function() {
      window.location.href = 'bloodRequest.html'; // Navigate to Blood Request page
    });
  }
});
