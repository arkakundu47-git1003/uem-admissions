import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, CalendarClock, Clock, Percent, Users } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { deadlineInfo, formatINR } from '../../lib/format';
import { fadeUp } from '../../lib/motion';

export function CourseCard({ course, index = 0 }) {
  const dl = deadlineInfo(course.deadline, course.isOpen);
  return (
    <motion.div variants={fadeUp} custom={index} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-40px' }} style={{ height: '100%' }}>
      <Link to={`/courses/${course._id || course.id}`} className="card card-hover course-card" aria-label={`${course.name}, ${dl.label}`}>
        <div className="row-between">
          <Badge tone="brand" plain>{course.code}</Badge>
          <Badge tone={course.level === 'PG' ? 'info' : 'neutral'} plain>{course.level}</Badge>
        </div>
        <div>
          <h3>{course.name}</h3>
          <p className="muted" style={{ fontSize: 'var(--text-sm)', marginTop: 4 }}>{course.department}</p>
        </div>
        <div className="meta">
          <span><Clock size={15} aria-hidden="true" /> {course.durationYears} yrs</span>
          <span><Users size={15} aria-hidden="true" /> {course.seats} seats</span>
          <span><Percent size={15} aria-hidden="true" /> min {course.minPercentage}%</span>
        </div>
        <div className="foot">
          <span className="deadline" data-tone={dl.tone}><CalendarClock size={16} aria-hidden="true" /> {dl.label}</span>
          <span className="row" style={{ gap: 6, fontWeight: 600, color: 'var(--primary)' }}>{formatINR(course.applicationFee)} <ArrowRight size={16} aria-hidden="true" /></span>
        </div>
      </Link>
    </motion.div>
  );
}
