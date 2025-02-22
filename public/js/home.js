const greeting = document.querySelector('.greeting');

window.onload = () => {
    if(!sessionStorage.name){
        location.href = '/login';
    } else {
        greeting.innerHTML = `Welcome, ${sessionStorage.name}`;
    }
}

const logOut = document.querySelector('.logout');

logOut.addEventListener('click', () => {
    sessionStorage.clear();
    location.reload();
})