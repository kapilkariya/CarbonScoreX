-- Seed data for CarbonScoreX
-- Password for all users: "password123" (hashed with bcrypt, cost 10)
-- Hash: $2b$10$uMo.xXD.NsOw7I1UpeHguOxPnzubwjmBLjLEbPdJ168rHgFBbsg0a

-- Insert users
INSERT INTO users (email, password_hash, user_type, full_name) VALUES
('admin@gmail.com', '$2b$10$uMo.xXD.NsOw7I1UpeHguOxPnzubwjmBLjLEbPdJ168rHgFBbsg0a', 'government', 'Government Admin'),
('greentech@example.com', '$2b$10$uMo.xXD.NsOw7I1UpeHguOxPnzubwjmBLjLEbPdJ168rHgFBbsg0a', 'company', 'GreenTech Industries'),
('ecofactory@example.com', '$2b$10$uMo.xXD.NsOw7I1UpeHguOxPnzubwjmBLjLEbPdJ168rHgFBbsg0a', 'company', 'EcoFactory Ltd'),
('pollutecorp@example.com', '$2b$10$uMo.xXD.NsOw7I1UpeHguOxPnzubwjmBLjLEbPdJ168rHgFBbsg0a', 'company', 'PolluteCorp'),
('john.tree@example.com', '$2b$10$uMo.xXD.NsOw7I1UpeHguOxPnzubwjmBLjLEbPdJ168rHgFBbsg0a', 'individual', 'John Tree Owner'),
('sarah.forest@example.com', '$2b$10$uMo.xXD.NsOw7I1UpeHguOxPnzubwjmBLjLEbPdJ168rHgFBbsg0a', 'individual', 'Sarah Forest Owner');

-- Insert companies
INSERT INTO companies (user_id, company_name, industry, registration_number, address) VALUES
(2, 'GreenTech Industries', 'Renewable Energy', 'REG-GT-2024-001', '123 Green Street, Eco City'),
(3, 'EcoFactory Ltd', 'Manufacturing', 'REG-EF-2024-002', '456 Clean Ave, Green Town'),
(4, 'PolluteCorp', 'Heavy Industry', 'REG-PC-2024-003', '789 Industrial Rd, Smoke City');

-- Insert initial credits
INSERT INTO credits (owner_id, amount) VALUES
(2, 1000.00),  -- GreenTech
(3, 500.00),   -- EcoFactory
(4, 100.00),   -- PolluteCorp
(5, 2500.00),  -- John (tree owner)
(6, 3000.00);  -- Sarah (tree owner)

-- Insert sample company data records
INSERT INTO company_data_records (company_id, data) VALUES
(1, '{"energy_consumption": 1000, "renewable_energy_pct": 80, "waste_recycled_pct": 70, "emissions_co2": 500, "water_usage": 1000}'),
(2, '{"energy_consumption": 5000, "renewable_energy_pct": 50, "waste_recycled_pct": 60, "emissions_co2": 2000, "water_usage": 3000}'),
(3, '{"energy_consumption": 15000, "renewable_energy_pct": 10, "waste_recycled_pct": 20, "emissions_co2": 8000, "water_usage": 10000}');

-- Insert sample carbon scores
INSERT INTO carbon_scores (company_id, score, score_category, explanation, data_record_id) VALUES
(1, 85.50, 'Excellent', '{"top_features": {"renewable_energy_pct": 0.35, "waste_recycled_pct": 0.25, "emissions_co2": -0.20}}', 1),
(2, 65.75, 'Good', '{"top_features": {"renewable_energy_pct": 0.25, "emissions_co2": -0.30, "energy_consumption": -0.15}}', 2),
(3, 32.25, 'Poor', '{"top_features": {"emissions_co2": -0.45, "renewable_energy_pct": 0.15, "waste_recycled_pct": 0.10}}', 3);

-- Insert sample certificates
INSERT INTO certificates (certificate_id, company_id, score_id, valid_until, signature_hash, verification_url) VALUES
('CERT-CSX-2026-0001', 1, 1, CURRENT_TIMESTAMP + INTERVAL '1 year', 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6', '/verify/CERT-CSX-2026-0001'),
('CERT-CSX-2026-0002', 2, 2, CURRENT_TIMESTAMP + INTERVAL '1 year', 'b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7', '/verify/CERT-CSX-2026-0002'),
('CERT-CSX-2026-0003', 3, 3, CURRENT_TIMESTAMP + INTERVAL '1 year', 'c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8', '/verify/CERT-CSX-2026-0003');

-- Insert sample tenders
INSERT INTO tenders (title, description, min_score, budget, deadline, created_by) VALUES
('Green Energy Infrastructure Project', 'Looking for companies with strong carbon scores to build renewable energy infrastructure', 70.00, 5000000.00, CURRENT_TIMESTAMP + INTERVAL '60 days', 1),
('Sustainable Manufacturing Contract', 'Contract for eco-friendly manufacturing services', 60.00, 2000000.00, CURRENT_TIMESTAMP + INTERVAL '45 days', 1),
('Carbon Offset Program', 'Partnership program for carbon offset initiatives', 50.00, 1000000.00, CURRENT_TIMESTAMP + INTERVAL '90 days', 1);

-- Insert sample tender applications
INSERT INTO tender_applications (tender_id, company_id, application_data, status) VALUES
(1, 1, '{"proposal": "We propose a comprehensive solar energy solution", "timeline": "12 months"}', 'approved'),
(2, 2, '{"proposal": "Our eco-friendly manufacturing process", "timeline": "18 months"}', 'pending');

-- Insert sample transactions
INSERT INTO transactions (from_user_id, to_user_id, amount, transaction_type, description) VALUES
(1, 2, 10000.00, 'subsidy', 'Government subsidy for excellent carbon score'),
(2, 5, 500.00, 'purchase', 'Purchase of carbon credits from tree owner'),
(3, 6, 300.00, 'purchase', 'Purchase of carbon credits from tree owner'),
(4, 1, 2000.00, 'tariff', 'Carbon tariff for poor environmental performance');
