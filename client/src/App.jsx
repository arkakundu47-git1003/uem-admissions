import { Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import ProtectedRoute from './routes/ProtectedRoute.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Courses from './pages/Courses.jsx';
import CourseDetails from './pages/CourseDetails.jsx';
import ApplicationWizard from './pages/ApplicationWizard.jsx';
import StudentDashboard from './pages/StudentDashboard.jsx';
import ApplicationStatus from './pages/ApplicationStatus.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import ApplicationReview from './pages/ApplicationReview.jsx';
import FacultyDashboard from './pages/FacultyDashboard.jsx';
import CourseManagement from './pages/CourseManagement.jsx';

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/courses" element={<Courses />} />
        <Route path="/courses/:id" element={<CourseDetails />} />

        <Route
          path="/student/dashboard"
          element={
            <ProtectedRoute allowedRoles={['STUDENT']}>
              <StudentDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/student/apply/:id"
          element={
            <ProtectedRoute allowedRoles={['STUDENT']}>
              <ApplicationWizard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/student/application/:id"
          element={
            <ProtectedRoute allowedRoles={['STUDENT']}>
              <ApplicationStatus />
            </ProtectedRoute>
          }
        />

        <Route
          path="/officer/dashboard"
          element={
            <ProtectedRoute allowedRoles={['ADMISSION_OFFICER']}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/dashboard"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route path="/admin/courses" element={<ProtectedRoute allowedRoles={['ADMIN']}><CourseManagement /></ProtectedRoute>} />
        <Route
          path="/admin/applications/:id"
          element={
            <ProtectedRoute allowedRoles={['ADMIN', 'ADMISSION_OFFICER']}>
              <ApplicationReview />
            </ProtectedRoute>
          }
        />
        <Route
          path="/officer/applications/:id"
          element={
            <ProtectedRoute allowedRoles={['ADMIN', 'ADMISSION_OFFICER']}>
              <ApplicationReview />
            </ProtectedRoute>
          }
        />

        <Route path="/faculty/dashboard" element={<ProtectedRoute allowedRoles={['FACULTY_COORDINATOR']}><FacultyDashboard /></ProtectedRoute>} />
        <Route path="/faculty/applications/:id" element={<ProtectedRoute allowedRoles={['FACULTY_COORDINATOR']}><ApplicationReview /></ProtectedRoute>} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
