-- Keep the existing seeded government account usable after its email change.
UPDATE users
SET email = 'admin@gmail.com',
    password_hash = '$2b$10$uMo.xXD.NsOw7I1UpeHguOxPnzubwjmBLjLEbPdJ168rHgFBbsg0a',
    user_type = 'government',
    full_name = 'Government Admin'
WHERE LOWER(email) = 'admin@carbonscorex.gov'
  AND NOT EXISTS (
    SELECT 1
    FROM users existing
    WHERE LOWER(existing.email) = 'admin@gmail.com'
  );

-- Restore the known seeded password for the Gmail account if it already exists.
UPDATE users
SET password_hash = '$2b$10$uMo.xXD.NsOw7I1UpeHguOxPnzubwjmBLjLEbPdJ168rHgFBbsg0a',
    user_type = 'government',
    full_name = 'Government Admin'
WHERE LOWER(email) = 'admin@gmail.com';

-- Create the seeded account when the database does not have either email yet.
INSERT INTO users (email, password_hash, user_type, full_name)
SELECT 'admin@gmail.com',
       '$2b$10$uMo.xXD.NsOw7I1UpeHguOxPnzubwjmBLjLEbPdJ168rHgFBbsg0a',
       'government',
       'Government Admin'
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE LOWER(email) IN ('admin@gmail.com', 'admin@carbonscorex.gov')
);
