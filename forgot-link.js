const loginForm = document.querySelector('#loginForm');
if (loginForm && !loginForm.querySelector('.forgot-link')) {
  const forgotLink = document.createElement('a');
  forgotLink.href = 'forgot.html';
  forgotLink.className = 'forgot-link';
  forgotLink.textContent = 'Forgot password?';
  loginForm.append(forgotLink);
}
