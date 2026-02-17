-- Seed categories
insert into public.categories (id, name, slug, description, display_order) values
  ('a1b2c3d4-0001-4000-8000-000000000001', 'Algebra', 'algebra', 'Linear equations, inequalities, systems, and functions', 1),
  ('a1b2c3d4-0002-4000-8000-000000000002', 'Advanced Math', 'advanced-math', 'Quadratics, polynomials, exponentials, and radicals', 2),
  ('a1b2c3d4-0003-4000-8000-000000000003', 'Problem Solving and Data Analysis', 'problem-solving', 'Ratios, percentages, probability, and statistics', 3),
  ('a1b2c3d4-0004-4000-8000-000000000004', 'Geometry and Trigonometry', 'geometry-trig', 'Lines, angles, triangles, circles, and trig functions', 4);

-- Seed Algebra topics (5 topics for MVP)
insert into public.topics (id, category_id, name, slug, description, display_order, prerequisite_topic_id) values
  ('b1b2c3d4-0001-4000-8000-000000000001', 'a1b2c3d4-0001-4000-8000-000000000001',
   'Linear Equations in One Variable', 'linear-equations-one-var',
   'Solving single-variable linear equations, including those with fractions and decimals', 1, null),
  ('b1b2c3d4-0002-4000-8000-000000000002', 'a1b2c3d4-0001-4000-8000-000000000001',
   'Linear Equations in Two Variables', 'linear-equations-two-var',
   'Slope-intercept form, point-slope form, graphing lines, and interpreting linear relationships', 2,
   'b1b2c3d4-0001-4000-8000-000000000001'),
  ('b1b2c3d4-0003-4000-8000-000000000003', 'a1b2c3d4-0001-4000-8000-000000000001',
   'Systems of Linear Equations', 'systems-linear-equations',
   'Solving systems of two equations using substitution, elimination, and graphing', 3,
   'b1b2c3d4-0002-4000-8000-000000000002'),
  ('b1b2c3d4-0004-4000-8000-000000000004', 'a1b2c3d4-0001-4000-8000-000000000001',
   'Linear Inequalities', 'linear-inequalities',
   'Solving and graphing linear inequalities in one and two variables', 4,
   'b1b2c3d4-0003-4000-8000-000000000003'),
  ('b1b2c3d4-0005-4000-8000-000000000005', 'a1b2c3d4-0001-4000-8000-000000000001',
   'Linear Functions and Applications', 'linear-functions-applications',
   'Function notation, domain/range, modeling real-world scenarios with linear functions', 5,
   'b1b2c3d4-0004-4000-8000-000000000004');
