-- Add topics for Advanced Math, Problem-Solving and Data Analysis, and Geometry and Trigonometry

-- Advanced Math topics (4 topics)
insert into public.topics (id, category_id, name, slug, description, display_order, prerequisite_topic_id) values
  ('b1b2c3d4-0006-4000-8000-000000000006', 'a1b2c3d4-0002-4000-8000-000000000002',
   'Equivalent Expressions', 'equivalent-expressions',
   'Rewriting and simplifying algebraic expressions using properties of exponents, factoring, and distribution', 1, null),
  ('b1b2c3d4-0007-4000-8000-000000000007', 'a1b2c3d4-0002-4000-8000-000000000002',
   'Nonlinear Equations in One Variable', 'nonlinear-equations-one-var',
   'Solving quadratic, radical, rational, and exponential equations in one variable', 2,
   'b1b2c3d4-0006-4000-8000-000000000006'),
  ('b1b2c3d4-0008-4000-8000-000000000008', 'a1b2c3d4-0002-4000-8000-000000000002',
   'Systems of Equations in Two Variables', 'systems-equations-two-var',
   'Solving systems involving at least one nonlinear equation using substitution and graphing', 3,
   'b1b2c3d4-0007-4000-8000-000000000007'),
  ('b1b2c3d4-0009-4000-8000-000000000009', 'a1b2c3d4-0002-4000-8000-000000000002',
   'Nonlinear Functions', 'nonlinear-functions',
   'Analyzing quadratic, polynomial, exponential, and radical functions including graphs and key properties', 4,
   'b1b2c3d4-0008-4000-8000-000000000008');

-- Problem-Solving and Data Analysis topics (7 topics)
insert into public.topics (id, category_id, name, slug, description, display_order, prerequisite_topic_id) values
  ('b1b2c3d4-0010-4000-8000-000000000010', 'a1b2c3d4-0003-4000-8000-000000000003',
   'Ratios, Rates, and Proportional Relationships', 'ratios-rates-proportions',
   'Solving problems involving ratios, unit rates, and proportional relationships', 1, null),
  ('b1b2c3d4-0011-4000-8000-000000000011', 'a1b2c3d4-0003-4000-8000-000000000003',
   'Percentages', 'percentages',
   'Calculating percentages, percent change, and solving multi-step percent problems', 2,
   'b1b2c3d4-0010-4000-8000-000000000010'),
  ('b1b2c3d4-0012-4000-8000-000000000012', 'a1b2c3d4-0003-4000-8000-000000000003',
   'One-Variable Data', 'one-variable-data',
   'Analyzing distributions, measures of center (mean, median, mode), and measures of spread', 3,
   'b1b2c3d4-0011-4000-8000-000000000011'),
  ('b1b2c3d4-0013-4000-8000-000000000013', 'a1b2c3d4-0003-4000-8000-000000000003',
   'Two-Variable Data', 'two-variable-data',
   'Interpreting scatterplots, lines of best fit, trends, and two-variable data modeling', 4,
   'b1b2c3d4-0012-4000-8000-000000000012'),
  ('b1b2c3d4-0014-4000-8000-000000000014', 'a1b2c3d4-0003-4000-8000-000000000003',
   'Probability and Conditional Probability', 'probability-conditional',
   'Computing probabilities of simple and compound events, conditional probability, and independence', 5,
   'b1b2c3d4-0013-4000-8000-000000000013'),
  ('b1b2c3d4-0015-4000-8000-000000000015', 'a1b2c3d4-0003-4000-8000-000000000003',
   'Inference and Margin of Error', 'inference-margin-of-error',
   'Making inferences from sample data, understanding margin of error, and confidence intervals', 6,
   'b1b2c3d4-0014-4000-8000-000000000014'),
  ('b1b2c3d4-0016-4000-8000-000000000016', 'a1b2c3d4-0003-4000-8000-000000000003',
   'Evaluating Statistical Claims', 'evaluating-statistical-claims',
   'Assessing validity of data collection methods, statistical arguments, and observational studies vs experiments', 7,
   'b1b2c3d4-0015-4000-8000-000000000015');

-- Geometry and Trigonometry topics (4 topics)
insert into public.topics (id, category_id, name, slug, description, display_order, prerequisite_topic_id) values
  ('b1b2c3d4-0017-4000-8000-000000000017', 'a1b2c3d4-0004-4000-8000-000000000004',
   'Area and Volume', 'area-and-volume',
   'Calculating area of 2D figures and volume of 3D solids including composite shapes', 1, null),
  ('b1b2c3d4-0018-4000-8000-000000000018', 'a1b2c3d4-0004-4000-8000-000000000004',
   'Lines, Angles, and Triangles', 'lines-angles-triangles',
   'Properties of parallel and perpendicular lines, angle relationships, and triangle theorems', 2,
   'b1b2c3d4-0017-4000-8000-000000000017'),
  ('b1b2c3d4-0019-4000-8000-000000000019', 'a1b2c3d4-0004-4000-8000-000000000004',
   'Right Triangles and Trigonometry', 'right-triangles-trig',
   'Pythagorean theorem, sine, cosine, tangent ratios, and solving right triangles', 3,
   'b1b2c3d4-0018-4000-8000-000000000018'),
  ('b1b2c3d4-0020-4000-8000-000000000020', 'a1b2c3d4-0004-4000-8000-000000000004',
   'Circles', 'circles',
   'Properties of circles including radius, diameter, circumference, arc length, sectors, and inscribed angles', 4,
   'b1b2c3d4-0019-4000-8000-000000000019');
