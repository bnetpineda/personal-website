-- Custom SQL migration file, put your code below! --
-- Default expense and income categories. Re-runnable: existing (kind, name) pairs are left alone.
INSERT INTO "categories" ("kind", "name", "color", "sort_order") VALUES
  ('expense', 'Food & Dining', '#FF8A3D', 10),
  ('expense', 'Groceries', '#8AE500', 20),
  ('expense', 'Transport', '#0099FF', 30),
  ('expense', 'Bills & Utilities', '#FACC00', 40),
  ('expense', 'Housing', '#7A83FF', 50),
  ('expense', 'Shopping', '#E879F9', 60),
  ('expense', 'Health & Fitness', '#00B3A4', 70),
  ('expense', 'Subscriptions', '#FF4D50', 80),
  ('expense', 'Entertainment', '#b6f23a', 90),
  ('expense', 'Education', '#0099FF', 100),
  ('expense', 'Travel', '#00B3A4', 110),
  ('expense', 'Family & Gifts', '#E879F9', 120),
  ('expense', 'Other', '#A8A29E', 130),
  ('income', 'Salary', '#8AE500', 10),
  ('income', 'Freelance', '#0099FF', 20),
  ('income', 'Business', '#7A83FF', 30),
  ('income', 'Investment income', '#FACC00', 40),
  ('income', 'Gifts', '#E879F9', 50),
  ('income', 'Other', '#A8A29E', 60)
ON CONFLICT ("kind", "name") DO NOTHING;
