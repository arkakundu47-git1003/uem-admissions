import { lazy, Suspense, useEffect } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { bootstrap } from './store/authSlice';
import PublicLayout from './layouts/PublicLayout';
import DashboardLayout from './layouts/DashboardLayout';
import { GuestOnly, RequireRole } from './routes/guards';
import { PageLoader } from './components/ui/Feedback';
import { EmptyState } from './components/ui/Feedback';
import { Button } from './components/ui/Button';
import { Compass } from 'lucide-react';

// Code-split per area so applicants never download the admin bundle.
const Landing = lazy(() => import('./features/public/LandingPage'));
const Courses = lazy(() => import('./features/public/CoursesPage'));
const CourseDetail = lazy(() => import('./features/public/CourseDetailPage'));
const Login = lazy(() => import('./features/auth/LoginPage'));
const Register = lazy(() => import('./features/auth/RegisterPage'));
const ApplicantDashboard = lazy(() => import('./features/applicant/ApplicantDashboard'));
const ApplyWizard = lazy(() => import('./features/applicant/ApplyWizard'));
const ApplicationDetail = lazy(() => import('./features/applicant/ApplicationDetail'));
const Notifications = lazy(() => import('./features/shared/NotificationsPage'));
const StaffOverview = lazy(() => import('./features/staff/StaffOverview'));
const ReviewQueue = lazy(() => import('./features/staff/ReviewQueue'));
const ReviewDetail = lazy(() => import('./features/staff/ReviewDetail'));
const AdminCourses = lazy(() => import('./features/admin/AdminCourses'));
const AdminUsers = lazy(() => import('./features/admin/AdminUsers'));
const AdminAnnouncements = lazy(() => import('./features/admin/AdminAnnouncements'));

function NotFound() {
  return (
    <div className="container section"><EmptyState icon={Compass} title="Page not found" action={<Button variant="primary" to="/">Back to home</Button>}>The page you’re looking for doesn’t exist or has moved.</EmptyState></div>
  );
}

export default function App() {
  const dispatch = useDispatch();
  useEffect(() => { dispatch(bootstrap()); }, [dispatch]);

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Landing />} />
          <Route path="courses" element={<Courses />} />
          <Route path="courses/:id" element={<CourseDetail />} />
        </Route>

        <Route element={<GuestOnly />}>
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />
        </Route>

        <Route element={<RequireRole roles={['applicant']} />}>
          <Route path="applicant" element={<DashboardLayout area="applicant" />}>
            <Route index element={<ApplicantDashboard />} />
            <Route path="apply/:courseId" element={<ApplyWizard />} />
            <Route path="applications/:id" element={<ApplicationDetail />} />
            <Route path="notifications" element={<Notifications />} />
          </Route>
        </Route>

        <Route element={<RequireRole roles={['officer', 'coordinator', 'admin']} />}>
          <Route element={<DashboardLayout area="staff" />}>
            <Route path="staff" element={<StaffOverview />} />
            <Route path="staff/applications" element={<ReviewQueue />} />
            <Route path="staff/applications/:id" element={<ReviewDetail />} />
            <Route path="staff/notifications" element={<Notifications />} />
          </Route>
        </Route>

        <Route element={<RequireRole roles={['admin']} />}>
          <Route element={<DashboardLayout area="staff" />}>
            <Route path="admin/courses" element={<AdminCourses />} />
            <Route path="admin/users" element={<AdminUsers />} />
            <Route path="admin/announcements" element={<AdminAnnouncements />} />
          </Route>
        </Route>

        <Route element={<PublicLayout />}><Route path="*" element={<NotFound />} /></Route>
      </Routes>
    </Suspense>
  );
}
