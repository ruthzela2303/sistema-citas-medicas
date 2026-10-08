document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.querySelector('.login-form');

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            // 1. Evitar que la página se recargue automáticamente
            e.preventDefault();

            // 2. Capturar los valores de las cajas de texto de la clínica
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;

            try {
                // 3. Enviar los datos de forma asíncrona hacia el backend de Node
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ email, password })
                });

                const data = await response.json();

                // 4. Evaluar la respuesta del servidor médico
                if (data.success) {
                    alert(`¡Bienvenido al Portal Clínico, ${data.user.nombre}!`);
                    
                    // Guardar los datos del usuario en la memoria intermedia del navegador
                    localStorage.setItem('usuario_id', data.user.id);
                    localStorage.setItem('usuario_nombre', data.user.nombre);
                    localStorage.setItem('usuario_rol', data.user.rol);

                    // Redireccionar al panel central de control médico
                    window.location.href = 'dashboard.html';
                } else {
                    // Mostrar error de credenciales inválidas
                    alert(`Atención: ${data.message}`);
                }

            } catch (error) {
                console.error('Error al conectar con la API Médica:', error);
                alert('Hubo un problema al enlazar con el servidor de la clínica. Inténtalo más tarde.');
            }
        });
    }
});
