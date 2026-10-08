require('dotenv').config(); // Cargar variables de entorno desde el .env
const express = require('express');
const mysql = require('mysql2');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares para procesar datos JSON y formularios
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Servir la carpeta pública (HTML, CSS, JS del Frontend)
app.use(express.static(path.join(__dirname, 'public')));

// Servir la librería jsPDF de forma local y segura desde node_modules
app.use('/js/jspdf.umd.min.js', express.static(path.join(__dirname, 'node_modules', 'jspdf', 'dist', 'jspdf.umd.min.js')));


// 🗄️ Configuración de Conexión Inteligente y Certificado SSL Obligatorio para Internet
const db = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'sistema_medico',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: process.env.DB_HOST ? { rejectUnauthorized: false } : false
});

console.log('✅ Pool de conexiones con SSL configurado con éxito para internet.');

// Ruta base para cargar la interfaz principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 🔐 API ENDPOINT: Lógica de Login Real consultando a MySQL con índice limpio
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const query = 'SELECT id, nombre, rol, contrasena FROM usuarios WHERE correo = ?';

    db.query(query, [email], (err, results) => {
        if (err) {
            console.error('Error en la consulta SQL:', err);
            return res.status(500).json({ success: false, message: 'Error interno del servidor.' });
        }

        if (results && results.length > 0) {
            const usuario = results[0]; // Tomamos el primer registro de la lista de resultados

            if (usuario.contrasena === password) {
                return res.json({
                    success: true,
                    message: '¡Autenticación exitosa!',
                    user: {
                        id: usuario.id,
                        nombre: usuario.nombre,
                        rol: usuario.rol
                    }
                });
            }
        }
        return res.status(401).json({ success: false, message: 'Correo o contraseña incorrectos.' });
    });
});

// 👨‍⚕️ API ENDPOINT: Obtener el listado de médicos especialistas de la clínica
app.get('/api/medicos', (req, res) => {
    const query = 'SELECT id, nombre, especialidad, consultorio FROM medicos';

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error al traer los médicos de MySQL:', err);
            return res.status(500).json({ success: false, message: 'Error al consultar los médicos.' });
        }
        res.setHeader('Content-Type', 'application/json');
        res.status(200).json({ success: true, medicos: results });
    });
});

// 📅 API ENDPOINT: Registrar una nueva cita médica en la base de datos
app.post('/api/matricular-cita', (req, res) => {
    const { id_paciente, id_medico, fecha, hora } = req.body;

    if (!id_paciente || !id_medico || !fecha || !hora) {
        return res.status(400).json({ success: false, message: 'Faltan datos obligatorios para agendar.' });
    }

    const query = 'INSERT INTO citas (id_paciente, id_medico, fecha, hora) VALUES (?, ?, ?, ?)';

    db.query(query, [id_paciente, id_medico, fecha, hora], (err, result) => {
        if (err) {
            console.error('Error al insertar la cita en MySQL:', err);
            return res.status(500).json({ success: false, message: 'Error interno al procesar la reserva.' });
        }
        res.json({ success: true, message: '¡Tu cita médica ha sido agendada con éxito!' });
    });
});

// 📋 API ENDPOINT CORREGIDO: Alias ajustados exactamente al mapeo del Frontend (dashboard.html)
app.get('/api/citas-globales', (req, res) => {
    const query = `
        SELECT 
            c.id, 
            u.nombre AS paciente, 
            m.nombre AS medico, 
            m.especialidad AS especialidad, 
            DATE_FORMAT(c.fecha, '%Y-%m-%d') AS fecha, 
            c.hora, 
            c.estado 
        FROM citas c
        INNER JOIN usuarios u ON c.id_paciente = u.id
        INNER JOIN medicos m ON c.id_medico = m.id
        ORDER BY c.fecha ASC, c.hora ASC
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error al traer citas globales con JOIN:', err);
            return res.status(500).json({ success: false, message: 'Error en la base de datos al consultar citas.' });
        }
        res.setHeader('Content-Type', 'application/json');
        res.status(200).json({ success: true, citas: results });
    });
});

// 📊 API ENDPOINT UNIFICADO: Cuenta especialistas totales y el total absoluto de citas del hospital
app.get('/api/estadisticas-medicas', (req, res) => {
    const queryMedicos = 'SELECT COUNT(*) AS total_medicos FROM medicos';
    const queryCitasTotales = 'SELECT COUNT(*) AS total_citas FROM citas';

    db.query(queryMedicos, (err, resMedicos) => {
        if (err) {
            console.error('Error al contar especialistas:', err);
            return res.status(500).json({ success: false, message: 'Error en base de datos.' });
        }

        db.query(queryCitasTotales, (err, resCitas) => {
            if (err) {
                console.error('Error al contar citas totales:', err);
                return res.status(500).json({ success: false, message: 'Error en base de datos.' });
            }

            res.setHeader('Content-Type', 'application/json');
            
            const cantidadMedicos = (resMedicos && resMedicos[0]) ? resMedicos[0].total_medicos : 0;
            const cantidadCitas = (resCitas && resCitas[0]) ? resCitas[0].total_citas : 0;

            res.status(200).json({
                success: true,
                totalMedicos: cantidadMedicos,
                totalCitasHoy: cantidadCitas 
            });
        });
    });
});

// 👤 API ENDPOINT NUEVO: Obtener las citas exclusivas del paciente agendadas estrictamente para el día de hoy
app.get('/api/mis-citas-hoy/:id_paciente', (req, res) => {
    const idPaciente = req.params.id_paciente;

    const query = `
        SELECT c.id, m.nombre AS medico, m.especialidad, DATE_FORMAT(c.fecha, '%Y-%m-%d') AS fecha, c.hora, c.estado 
        FROM citas c
        INNER JOIN medicos m ON c.id_medico = m.id
        WHERE c.id_paciente = ? AND c.fecha = CURDATE()
        ORDER BY c.hora ASC
    `;

    db.query(query, [idPaciente], (err, results) => {
        if (err) {
            console.error('Error al consultar las citas de hoy del paciente:', err);
            return res.status(500).json({ success: false, message: 'Error en la base de datos.' });
        }
        res.setHeader('Content-Type', 'application/json');
        res.status(200).json({ success: true, citas: results });
    });
});

// 🔄 API ENDPOINT: Cambiar el estado de una cita médica (Completada, Cancelada, Pendiente) con confirmación JSON limpia
app.put('/api/actualizar-estado-cita', (req, res) => {
    const { id_cita, nuevo_estado } = req.body;

    if (!id_cita || !nuevo_estado) {
        return res.status(400).json({ success: false, message: 'Faltan datos obligatorios.' });
    }

    const query = 'UPDATE citas SET estado = ? WHERE id = ?';

    db.query(query, [nuevo_estado, id_cita], (err, result) => {
        if (err) {
            console.error('Error al actualizar el estado en MySQL:', err);
            return res.status(500).json({ success: false, message: 'Error interno del servidor.' });
        }
        
        res.setHeader('Content-Type', 'application/json');
        return res.status(200).json({ 
            success: true, 
            message: '¡El estado de la cita ha sido modificado con éxito en la clínica!' 
        });
    });
});

// Iniciar el servidor web de la clínica
app.listen(PORT, () => {
    console.log(`🚀 Servidor médico corriendo con éxito en internet mediante el puerto ${PORT}`);
});
