// Sample products for every subcategory — used by `npm run seed:demo`
// (server/prisma/seed-demo-catalog.js) so each category page has real
// cards to show while sellers are onboarding.
//
// Shape: { [category]: { [subcategory]: [[name, priceCents, compareAtCents|0, emoji, description], ...] } }
//   - compareAtCents > priceCents renders as a deal ("-20%").
//   - emoji is drawn into the product's generated artwork
//     (server/prisma/generate-demo-images.js).
// Brand names are invented. Prices are in US cents, like all products.

const DEMO_CATALOG = {
  Electronics: {
    'Audio & Headphones': [
      ['Sonora Pulse ANC Earbuds', 5999, 7999, '🎧', 'Active noise cancelling, 32-hour battery with case, IPX5 sweat resistance.'],
      ['Sonora Studio Over-Ear Headphones', 8999, 0, '🎧', 'Plush memory-foam cushions, 40 mm drivers and a foldable travel design.'],
      ['Boomtown Mini Bluetooth Speaker', 2999, 3999, '🔊', 'Room-filling 10 W sound, 12-hour playtime and a rugged splash-proof shell.'],
    ],
    Wearables: [
      ['Kora Fit Band 4', 3499, 0, '⌚', 'Heart-rate, sleep and step tracking with a 14-day battery.'],
      ['Kora Smartwatch S2', 11999, 14999, '⌚', '1.4" AMOLED, built-in GPS, call notifications and 50 m water resistance.'],
      ['Kora Kids Tracker Watch', 4999, 0, '⌚', 'Two-way calling, safe-zone alerts and a tough silicone strap.'],
    ],
    'Cameras & Drones': [
      ['TrailCam 4K Action Camera', 15999, 18999, '📷', 'Waterproof to 30 m, electronic stabilisation and dual screens.'],
      ['SkyHop Mini Foldable Drone', 24999, 0, '🚁', '2.7K camera, 25-minute flight time and one-tap return home.'],
      ['Lumen Mirrorless Starter Kit', 54999, 59999, '📸', '24 MP sensor with a 15–45 mm kit lens and 4K video.'],
    ],
    'Smart Home': [
      ['HomeLink Smart Plug (2-pack)', 2499, 0, '🔌', 'Schedule and control appliances from your phone, with energy monitoring.'],
      ['HomeLink Wi-Fi Security Camera', 3999, 4999, '📹', '1080p night vision, motion alerts and two-way talk.'],
      ['Glow Smart LED Bulb (4-pack)', 2999, 0, '💡', '16 million colours, dimmable and voice-assistant compatible.'],
    ],
    'Power & Charging': [
      ['VoltPack 20,000 mAh Power Bank', 3499, 4499, '🔋', '22.5 W fast charging with USB-C in/out — charges a phone up to 4 times.'],
      ['VoltCharge 65 W GaN Charger', 3999, 0, '⚡', 'Three ports, compact enough to charge a laptop, tablet and phone at once.'],
      ['VoltPack Solar Power Bank', 2999, 0, '☀️', 'Built-in solar panel and torch for travel and power cuts.'],
    ],
    Accessories: [
      ['Braided USB-C Cable (2 m, 2-pack)', 1299, 0, '🔗', 'Nylon braided, 60 W fast charging and data transfer.'],
      ['FlexStand Aluminium Phone Stand', 1599, 1999, '📱', 'Adjustable angle and height for desk, kitchen and video calls.'],
      ['SwiftDrive 128 GB USB Flash Drive', 1499, 0, '💾', 'USB 3.2 speeds up to 150 MB/s in a metal keyring design.'],
    ],
  },
  Phones: {
    Smartphones: [
      ['Nova X12 5G (128 GB)', 34999, 39999, '📱', '6.6" 120 Hz display, 50 MP triple camera and 5,000 mAh battery.'],
      ['Nova A5 (64 GB)', 14999, 0, '📱', 'Big 6.5" screen, dual SIM and two-day battery life.'],
      ['Nova X12 Pro Refurbished (256 GB)', 42999, 54999, '📱', 'Certified refurbished, fully tested with a 6-month warranty.'],
    ],
    'Feature Phones': [
      ['Tough T10 Dual-SIM Phone', 2499, 0, '📞', '30-day standby, built-in torch and FM radio.'],
      ['Tough T20 4G Feature Phone', 3999, 4999, '📞', '4G calling, hotspot and mobile-money friendly keypad.'],
      ['Easy Senior Big-Button Phone', 3499, 0, '☎️', 'Large keys, loud speaker and an SOS button for emergencies.'],
    ],
    'Cases & Protection': [
      ['ArmorShell Rugged Case', 1499, 1999, '🛡️', 'Military-grade drop protection with raised camera edges.'],
      ['ClearView Slim Case', 999, 0, '🛡️', 'Crystal-clear, anti-yellowing TPU that shows off your phone.'],
      ['Tempered Glass Protector (3-pack)', 1199, 0, '🔷', '9H hardness, bubble-free install with alignment frame.'],
    ],
    'Chargers & Cables': [
      ['VoltCharge 25 W Fast Charger', 1999, 2499, '⚡', 'USB-C power delivery for a 50% charge in 30 minutes.'],
      ['VoltCharge 15 W Wireless Pad', 2499, 0, '🔋', 'Slim Qi charging pad with a foreign-object safety cut-off.'],
      ['Car Charger Dual-Port 36 W', 1599, 0, '🚗', 'Charge two phones at full speed on the road.'],
    ],
    'Phone Accessories': [
      ['GripRing Magnetic Holder', 899, 0, '🧲', 'Rotating ring grip that doubles as a stand and car-mount.'],
      ['Selfie Stick Tripod with Remote', 1999, 2499, '🤳', 'Extends to 1 m, Bluetooth shutter and stable tripod legs.'],
      ['SwiftCard 128 GB microSD', 1799, 0, '💾', 'A2 speed class for apps, photos and 4K video.'],
    ],
  },
  Computer: {
    Laptops: [
      ['Vertex Air 14" Laptop', 64999, 72999, '💻', 'Intel Core i5, 16 GB RAM, 512 GB SSD and a 10-hour battery.'],
      ['Vertex Study 15" Laptop', 39999, 0, '💻', '8 GB RAM, 256 GB SSD and a full-size keyboard with number pad.'],
      ['Vertex Forge 16" Gaming Laptop', 119999, 129999, '🎮', 'RTX graphics, 144 Hz screen and RGB keyboard.'],
    ],
    'Desktops & Monitors': [
      ['ClearView 24" IPS Monitor', 14999, 17999, '🖥️', 'Full HD, 75 Hz, slim bezels and an eye-care flicker-free panel.'],
      ['Vertex Mini Desktop PC', 44999, 0, '🖥️', 'Compact tower with Core i5, 16 GB RAM and 1 TB SSD.'],
      ['ClearView 27" 4K Monitor', 32999, 0, '🖥️', 'Sharp 4K detail with USB-C single-cable connection.'],
    ],
    'Keyboards & Mice': [
      ['QuietType Wireless Combo', 2999, 3999, '⌨️', 'Silent keys and mouse sharing one tiny USB receiver.'],
      ['ErgoGlide Vertical Mouse', 2499, 0, '🖱️', 'Natural handshake grip that reduces wrist strain.'],
      ['ClackPro Mechanical Keyboard', 6999, 0, '⌨️', 'Hot-swappable switches with white backlighting.'],
    ],
    'Storage & Memory': [
      ['SwiftDrive 1 TB Portable SSD', 8999, 10999, '💾', 'Up to 1,050 MB/s in a pocket-sized, drop-resistant case.'],
      ['SwiftDrive 2 TB External HDD', 7499, 0, '💽', 'USB 3.0 backup drive with automatic backup software.'],
      ['SwiftRAM 16 GB DDR4 Laptop Memory', 4499, 0, '🧠', '3200 MHz SO-DIMM upgrade for smoother multitasking.'],
    ],
    Networking: [
      ['AirMesh Dual-Band Wi-Fi Router', 5999, 6999, '📡', 'AC1200 speeds with four antennas for whole-home coverage.'],
      ['AirMesh Wi-Fi Range Extender', 2999, 0, '📶', 'Plug-in booster that removes dead zones.'],
      ['GoFi 4G Pocket Hotspot', 6999, 0, '📶', 'Share mobile data with up to 10 devices, 8-hour battery.'],
    ],
    'Printers & Scanners': [
      ['InkJet Home All-in-One Printer', 9999, 11999, '🖨️', 'Print, scan and copy over Wi-Fi from your phone.'],
      ['LaserPro Mono Office Printer', 17999, 0, '🖨️', 'Fast 30 ppm laser with automatic double-sided printing.'],
      ['ScanGo Portable Document Scanner', 8999, 0, '📄', 'Scan receipts and A4 pages straight to PDF.'],
    ],
  },
  Fashion: {
    Women: [
      ['Linen Wrap Midi Dress', 4499, 5999, '👗', 'Breathable linen blend with an adjustable waist tie.'],
      ['High-Rise Wide-Leg Trousers', 3999, 0, '👖', 'Flowing silhouette with pockets and a comfortable stretch waistband.'],
      ['Puff-Sleeve Cotton Blouse', 2999, 0, '👚', 'Soft cotton poplin with a relaxed fit and button front.'],
    ],
    Men: [
      ['Oxford Cotton Shirt', 3499, 0, '👔', 'Classic button-down collar in breathable Oxford weave.'],
      ['Stretch Slim Chinos', 4499, 5499, '👖', 'Four-way stretch twill that moves with you all day.'],
      ['Essential Crew T-Shirt (3-pack)', 2999, 0, '👕', 'Heavyweight cotton tees that keep their shape wash after wash.'],
    ],
    Kids: [
      ['Kids Dino Print Pyjama Set', 1999, 2499, '🦖', 'Soft cotton jersey with a fun all-over dinosaur print.'],
      ['Girls Tiered Party Dress', 2999, 0, '👗', 'Twirl-ready layered skirt for birthdays and celebrations.'],
      ['Boys Cargo Shorts', 1799, 0, '🩳', 'Durable cotton with six pockets for little explorers.'],
    ],
    'Traditional Wear': [
      ['Wax Print Ankara Maxi Dress', 5999, 6999, '👘', 'Vibrant 100% cotton wax print, tailored bodice and flared skirt.'],
      ['Embroidered Grand Boubou', 8999, 0, '🥻', 'Hand-finished embroidery for ceremonies and Fridays.'],
      ['Kente-Inspired Kaftan Shirt', 4499, 0, '👔', 'Relaxed-fit kaftan with woven-pattern trim.'],
    ],
    Accessories: [
      ['Canvas Weekend Tote', 2499, 0, '👜', 'Heavyweight canvas with leather handles and an inner pocket.'],
      ['Polarised Aviator Sunglasses', 1999, 2999, '🕶️', 'UV400 protection with a lightweight metal frame.'],
      ['Genuine Leather Belt', 2499, 0, '🪢', 'Full-grain leather with a brushed silver buckle.'],
    ],
  },
  Shoes: {
    Sneakers: [
      ['AeroRun Everyday Sneakers', 5999, 7499, '👟', 'Lightweight knit upper with responsive foam cushioning.'],
      ['CourtClassic Leather Sneakers', 6999, 0, '👟', 'Clean white leather low-tops that go with everything.'],
      ['AeroRun Trail Runners', 7999, 0, '👟', 'Grippy lugged outsole for dirt roads and trails.'],
    ],
    'Formal Shoes': [
      ['Heritage Leather Oxfords', 8999, 10999, '👞', 'Hand-burnished leather with a cushioned insole.'],
      ['Penny Suede Loafers', 6999, 0, '👞', 'Slip-on suede loafers for smart-casual days.'],
      ['Block Heel Court Shoes', 5499, 0, '👠', 'Comfortable 6 cm block heel for the office and events.'],
    ],
    'Sandals & Slides': [
      ['CloudStep Comfort Slides', 1999, 2499, '🩴', 'Ultra-soft moulded footbed that dries fast.'],
      ['Leather Strap Sandals', 3499, 0, '👡', 'Adjustable buckles and a contoured cork sole.'],
      ['Sport Hiking Sandals', 3999, 0, '🩴', 'Quick-release straps with a grippy rubber outsole.'],
    ],
    Boots: [
      ['Chelsea Leather Boots', 9999, 0, '👢', 'Elastic side panels and a durable rubber sole.'],
      ['SafeStep Steel-Toe Work Boots', 7999, 9499, '🥾', 'Steel toe cap and slip-resistant sole for site work.'],
      ['Waterproof Hiking Boots', 8999, 0, '🥾', 'Seam-sealed membrane and ankle support for long treks.'],
    ],
    'Kids’ Shoes': [
      ['Light-Up Kids Sneakers', 2999, 3499, '👟', 'LED soles that light up with every step, easy hook-and-loop.'],
      ['School Leather Shoes', 3499, 0, '👞', 'Scuff-resistant leather for the school year.'],
      ['First Steps Soft Shoes', 1999, 0, '👶', 'Flexible non-slip soles for new walkers.'],
    ],
  },
  Beauty: {
    Skincare: [
      ['Glow Vitamin C Serum 30 ml', 1999, 2499, '🧴', '15% vitamin C with ferulic acid for brighter, even skin.'],
      ['Daily Mineral Sunscreen SPF 50', 1799, 0, '🧴', 'No white cast, non-greasy and suitable for every skin tone.'],
      ['Shea Butter Night Cream', 1599, 0, '🫙', 'Rich overnight repair with raw shea and niacinamide.'],
    ],
    Makeup: [
      ['Velvet Matte Lipstick', 1199, 0, '💄', 'Long-wear colour that stays comfortable all day.'],
      ['Skin Tint Foundation — 20 Shades', 1999, 2499, '🎨', 'Lightweight medium coverage with a natural finish.'],
      ['Volume Lash Mascara', 1099, 0, '👁️', 'Smudge-proof volume in one coat.'],
    ],
    Haircare: [
      ['Coconut & Shea Curl Cream', 1499, 0, '🥥', 'Defines curls and coils while sealing in moisture.'],
      ['Black Castor Growth Oil', 1299, 1599, '🫒', 'Nourishes scalp and edges with pure black castor oil.'],
      ['Sulfate-Free Moisture Shampoo', 1199, 0, '🧴', 'Gentle cleanse for natural, relaxed and coloured hair.'],
    ],
    Fragrance: [
      ['Oud Noir Eau de Parfum 50 ml', 4999, 5999, '🌹', 'Warm oud, amber and rose for evenings.'],
      ['Citrus Bloom Eau de Toilette', 3499, 0, '🌸', 'Fresh orange blossom and bergamot for every day.'],
      ['Vanilla Musk Body Mist', 1299, 0, '✨', 'Light, sweet scent to layer through the day.'],
    ],
    'Bath & Body': [
      ['African Black Soap Bar (3-pack)', 999, 0, '🧼', 'Traditional plantain-ash soap for deep, gentle cleansing.'],
      ['Cocoa Butter Body Lotion', 1199, 1499, '🧴', '24-hour moisture with pure cocoa butter.'],
      ['Coffee Sugar Body Scrub', 1399, 0, '☕', 'Exfoliates and smooths with coffee grounds and coconut oil.'],
    ],
    'Men’s Grooming': [
      ['Beard Oil & Balm Kit', 2499, 2999, '🧔', 'Softens, tames and conditions with argan and jojoba.'],
      ['Precision Cordless Trimmer', 3499, 0, '✂️', '20 length settings and a 90-minute runtime.'],
      ['Charcoal Face Wash for Men', 999, 0, '🧴', 'Deep-cleans pores and controls shine.'],
    ],
  },
  Home: {
    Furniture: [
      ['Oslo 3-Seater Fabric Sofa', 49999, 59999, '🛋️', 'Deep cushions, solid wood legs and removable covers.'],
      ['Solid Wood Coffee Table', 14999, 0, '🪵', 'Mango wood top with a lower storage shelf.'],
      ['Upholstered Dining Chair (2-pack)', 12999, 0, '🪑', 'Padded seat with sturdy metal legs.'],
    ],
    'Bedding & Bath': [
      ['Cloud Memory Foam Pillow', 3999, 4999, '🛏️', 'Contoured support with a cooling gel layer.'],
      ['Egyptian Cotton Sheet Set — Queen', 5999, 0, '🛏️', '400 thread count, silky soft and breathable.'],
      ['Plush Bath Towel Set (6 pieces)', 3499, 0, '🛁', 'Quick-dry 600 GSM cotton in calming tones.'],
    ],
    Décor: [
      ['Woven Seagrass Wall Baskets (3)', 3999, 0, '🧺', 'Handwoven wall décor that adds natural texture.'],
      ['Ultrasonic Aroma Diffuser', 2999, 3999, '🌿', '7-colour mood light and 8-hour whisper-quiet mist.'],
      ['Round Gold Accent Mirror', 4999, 0, '🪞', '60 cm mirror with a slim brushed-gold frame.'],
    ],
    Lighting: [
      ['Rattan Pendant Light', 4499, 0, '💡', 'Warm, patterned light that softens any room.'],
      ['LED Desk Lamp with USB Port', 2499, 2999, '🪔', 'Three colour temperatures and touch dimming.'],
      ['Solar Garden Lantern (2-pack)', 1999, 0, '🏮', 'Auto-on at dusk, no wiring needed.'],
    ],
    'Storage & Organisation': [
      ['Stackable Storage Boxes (4)', 2499, 0, '📦', 'Clear lids so you can see everything at a glance.'],
      ['5-Tier Bamboo Shelf', 5999, 6999, '🗄️', 'Space-saving shelving for bathrooms and living rooms.'],
      ['Fabric Wardrobe Organiser', 3999, 0, '👚', 'Free-standing wardrobe with zip cover and shelves.'],
    ],
    Cleaning: [
      ['Spin Mop & Bucket Set', 2999, 3499, '🧹', 'Hands-free wringing with two microfibre heads.'],
      ['Cordless Stick Vacuum', 12999, 0, '🧹', '40-minute runtime and converts to a handheld.'],
      ['Microfibre Cleaning Cloths (12)', 999, 0, '🧽', 'Streak-free cleaning for glass, screens and kitchens.'],
    ],
  },
  Kitchen: {
    Cookware: [
      ['Pre-Seasoned Cast Iron Skillet 26 cm', 3999, 0, '🍳', 'Even heat for searing, frying and baking.'],
      ['Non-Stick Cookware Set (8 pieces)', 9999, 12999, '🍲', 'PFOA-free coating, induction-ready bases.'],
      ['Stainless Steel Stock Pot 12 L', 4999, 0, '🍲', 'For soups, stews and big family meals.'],
    ],
    'Small Appliances': [
      ['CrispAir 5 L Air Fryer', 7999, 9999, '🍟', 'Crispy results with up to 80% less oil.'],
      ['PowerBlend 1200 W Blender', 5999, 0, '🥤', 'Crushes ice and blends smoothies in seconds.'],
      ['Smart Rice Cooker 1.8 L', 4499, 0, '🍚', 'Fuzzy-logic cooking with keep-warm and steam basket.'],
    ],
    'Knives & Utensils': [
      ['Chef’s Knife 20 cm', 3499, 4499, '🔪', 'High-carbon stainless steel with an ergonomic handle.'],
      ['Bamboo Cutting Board Set (3)', 1999, 0, '🪵', 'Knife-friendly bamboo with juice grooves.'],
      ['Silicone Utensil Set (10 pieces)', 2499, 0, '🥄', 'Heat-resistant to 230 °C, safe for non-stick pans.'],
    ],
    'Food Storage': [
      ['Glass Meal-Prep Containers (10)', 2999, 3499, '🥡', 'Oven, microwave and freezer safe with snap lids.'],
      ['Airtight Pantry Jars (6)', 2499, 0, '🫙', 'Keep grains, spices and snacks fresh.'],
      ['Insulated Lunch Box', 1799, 0, '🍱', 'Keeps food warm or cold for up to 6 hours.'],
    ],
    Tableware: [
      ['Stoneware Dinner Set (16 pieces)', 6999, 8499, '🍽️', 'Service for four in a speckled reactive glaze.'],
      ['Crystal-Clear Drinking Glasses (6)', 1999, 0, '🥛', 'Dishwasher-safe everyday tumblers.'],
      ['Stainless Cutlery Set (24 pieces)', 3499, 0, '🍴', 'Mirror-polished 18/10 steel.'],
    ],
  },
  Sports: {
    Football: [
      ['ProMatch Size 5 Football', 2999, 3499, '⚽', 'Thermo-bonded panels for true flight in all weather.'],
      ['Firm Ground Football Boots', 5999, 0, '👟', 'Lightweight synthetic upper with moulded studs.'],
      ['Training Cones & Ladder Set', 1999, 0, '🎽', 'Agility ladder plus 20 marker cones.'],
    ],
    Basketball: [
      ['Indoor/Outdoor Size 7 Basketball', 2499, 0, '🏀', 'Deep channels and composite leather for great grip.'],
      ['Portable Basketball Hoop', 19999, 22999, '🏀', 'Height-adjustable from 2.3 m to 3.05 m with a fillable base.'],
      ['High-Top Court Shoes', 6999, 0, '👟', 'Ankle support and cushioned landings.'],
    ],
    'Racket Sports': [
      ['Graphite Tennis Racket', 6999, 7999, '🎾', 'Lightweight frame with a generous sweet spot.'],
      ['Badminton Set for 4', 2999, 0, '🏸', 'Four rackets, shuttlecocks and a carry bag.'],
      ['Table Tennis Bat Set', 1999, 0, '🏓', 'Two bats, three balls and a cover.'],
    ],
    Cycling: [
      ['City Commuter Bike 26"', 24999, 27999, '🚲', '7-speed gears, mudguards and a rear rack.'],
      ['Ventilated Cycling Helmet', 2999, 0, '⛑️', 'Certified protection with adjustable fit dial.'],
      ['USB Rechargeable Bike Lights', 1499, 0, '🔦', 'Front and rear lights with five modes.'],
    ],
    'Outdoor & Camping': [
      ['4-Person Dome Tent', 8999, 10999, '⛺', 'Waterproof flysheet and a 10-minute setup.'],
      ['Trekker 40 L Backpack', 4499, 0, '🎒', 'Ventilated back panel and rain cover included.'],
      ['Camping Lantern Power Bank', 2499, 0, '🏕️', 'Bright LED lantern that also charges your phone.'],
    ],
    Sportswear: [
      ['DryFit Training T-Shirt', 1999, 0, '🎽', 'Moisture-wicking fabric that keeps you cool.'],
      ['Running Shorts with Liner', 2499, 2999, '🩳', 'Lightweight with a zip pocket for keys.'],
      ['Team Jersey Kit (Shirt + Shorts)', 3499, 0, '👕', 'Breathable kit, ready for custom numbers.'],
    ],
  },
  Fitness: {
    'Strength Training': [
      ['Adjustable Dumbbells 2–24 kg (pair)', 24999, 29999, '🏋️', 'Replace 15 sets of weights with one dial.'],
      ['Cast Iron Kettlebell 12 kg', 3999, 0, '🏋️', 'Wide handle for swings, squats and presses.'],
      ['Resistance Band Set (5 levels)', 1999, 0, '💪', 'Door anchor, handles and ankle straps included.'],
    ],
    'Cardio Equipment': [
      ['Folding Home Treadmill', 39999, 44999, '🏃', '12 km/h top speed, folds flat for storage.'],
      ['Magnetic Exercise Bike', 19999, 0, '🚴', 'Eight resistance levels and a tablet holder.'],
      ['Speed Skipping Rope', 999, 0, '➰', 'Ball-bearing handles and an adjustable steel cable.'],
    ],
    'Yoga & Pilates': [
      ['Non-Slip Yoga Mat 6 mm', 2499, 2999, '🧘', 'Cushioned, grippy and easy to roll up.'],
      ['Cork Yoga Blocks (2)', 1499, 0, '🧱', 'Firm natural cork for support and balance.'],
      ['Pilates Ring & Ball Set', 1999, 0, '⭕', 'Tone and strengthen your core at home.'],
    ],
    Recovery: [
      ['High-Density Foam Roller', 1999, 0, '🌀', 'Eases muscle tightness after training.'],
      ['Percussion Massage Gun', 7999, 9999, '💆', 'Six heads and 20 speeds for deep-tissue relief.'],
      ['Knee Compression Sleeves (pair)', 1799, 0, '🦵', 'Support and warmth for joints during workouts.'],
    ],
    'Sports Nutrition': [
      ['Whey Protein 2 kg — Chocolate', 5999, 6999, '🥤', '24 g protein per serving, mixes smooth.'],
      ['Electrolyte Hydration Tablets', 999, 0, '💧', 'Replace salts lost in heat and hard training.'],
      ['Shaker Bottle 700 ml', 799, 0, '🥤', 'Leak-proof lid with a mixing ball.'],
    ],
  },
  Toys: {
    'Educational Toys': [
      ['STEM Robot Building Kit', 3999, 4999, '🤖', 'Build and code a robot — ages 8+.'],
      ['Wooden Alphabet Puzzle', 1499, 0, '🔤', 'Chunky letters for early reading — ages 2+.'],
      ['Kids Microscope Set', 2999, 0, '🔬', '100×–1200× zoom with slides and tools — ages 8+.'],
    ],
    'Building Sets': [
      ['City Builder Bricks (500 pieces)', 2999, 0, '🧱', 'Compatible bricks with wheels, windows and doors.'],
      ['Magnetic Tiles (60 pieces)', 3999, 4999, '🧲', 'Snap together 3D shapes — ages 3+.'],
      ['Wooden Block Tower Set', 1999, 0, '🪵', '100 natural wooden blocks in a storage tub.'],
    ],
    'Dolls & Figures': [
      ['Ada Fashion Doll with Outfits', 2499, 0, '🎎', 'Doll with three outfits and accessories.'],
      ['Superhero Action Figure Set', 1999, 2499, '🦸', 'Five posable heroes with accessories.'],
      ['Dollhouse Family Playset', 4999, 0, '🏠', 'Two-storey house with furniture and figures.'],
    ],
    'Outdoor Play': [
      ['Kids 3-Wheel Scooter', 3999, 4999, '🛴', 'Light-up wheels and adjustable handlebar — ages 3+.'],
      ['Garden Bubble Machine', 1999, 0, '🫧', 'Hundreds of bubbles a minute.'],
      ['Ride-On Balance Bike', 4999, 0, '🚲', 'Builds balance before pedals — ages 2–5.'],
    ],
    'Board Games & Puzzles': [
      ['Family Strategy Board Game', 2999, 0, '🎲', '2–6 players, 45-minute games — ages 8+.'],
      ['1000-Piece Landscape Jigsaw', 1499, 1999, '🧩', 'Beautiful savannah scene on thick board.'],
      ['Classic Wooden Ludo Set', 1299, 0, '🎲', 'Timeless family favourite, crafted in wood.'],
    ],
  },
  Gaming: {
    Consoles: [
      ['PlayCore Handheld Console', 29999, 34999, '🎮', '7" screen, dock to TV and play anywhere.'],
      ['PlayCore Home Console 1 TB', 49999, 0, '🕹️', '4K gaming with fast load times.'],
      ['Retro Mini Console (500 games)', 4999, 0, '👾', 'Plug-and-play classics with two controllers.'],
    ],
    'Video Games': [
      ['Galaxy Racers (Physical)', 4999, 5999, '🏎️', 'Arcade racing with split-screen multiplayer.'],
      ['Kingdom Quest Adventure', 5999, 0, '🗡️', 'Open-world fantasy with 60+ hours of story.'],
      ['Football Manager Pro 26', 4499, 0, '⚽', 'Build your club from the ground up.'],
    ],
    Controllers: [
      ['Wireless Pro Controller', 4999, 5999, '🎮', 'Hall-effect sticks, 30-hour battery.'],
      ['Wired PC/Console Gamepad', 2499, 0, '🎮', 'Plug-and-play with dual vibration.'],
      ['Controller Charging Dock', 1999, 0, '🔋', 'Charge two controllers at once.'],
    ],
    'Gaming Headsets': [
      ['StormSound 7.1 Gaming Headset', 4999, 5999, '🎧', 'Virtual surround and a noise-cancelling mic.'],
      ['StormSound Wireless Headset', 7999, 0, '🎧', 'Low-latency 2.4 GHz with 40-hour battery.'],
      ['Headset Stand with USB Hub', 1999, 0, '🎧', 'Keeps your desk tidy and adds two USB ports.'],
    ],
    'PC Gaming': [
      ['RGB Gaming Mouse 16,000 DPI', 2999, 3999, '🖱️', 'Ultra-light with programmable buttons.'],
      ['Ergonomic Gaming Chair', 19999, 0, '🪑', 'Lumbar support, 4D armrests and recline.'],
      ['XL Desk Mouse Mat', 1499, 0, '⬛', '90 × 40 cm stitched-edge mat.'],
    ],
  },
  'TV & Audio': {
    Televisions: [
      ['Vista 43" 4K Smart TV', 29999, 34999, '📺', 'HDR, built-in streaming apps and screen mirroring.'],
      ['Vista 32" HD LED TV', 14999, 0, '📺', 'Compact HD screen with USB playback.'],
      ['Vista 55" QLED 4K TV', 54999, 62999, '📺', 'Quantum-dot colour and Dolby Audio.'],
    ],
    'Soundbars & Home Theatre': [
      ['BassLine 2.1 Soundbar with Subwoofer', 14999, 17999, '🔊', '300 W cinema sound with HDMI ARC.'],
      ['BassLine 5.1 Home Theatre', 29999, 0, '🎬', 'Surround speakers for movie nights.'],
      ['Compact TV Soundbar', 7999, 0, '🔊', 'Clearer dialogue in a slim 60 cm bar.'],
    ],
    Speakers: [
      ['PartyBox 100 W Speaker', 14999, 17999, '🔊', 'Light show, mic input and 12-hour battery.'],
      ['Bookshelf Speakers (pair)', 9999, 0, '🔈', 'Warm, detailed sound with Bluetooth.'],
      ['Waterproof Shower Speaker', 1999, 0, '🚿', 'Suction mount and hands-free calls.'],
    ],
    'Streaming Devices': [
      ['StreamStick 4K', 4999, 5999, '📡', 'Turn any TV into a smart TV with voice remote.'],
      ['Android TV Box 4 GB', 5999, 0, '📦', 'Apps, games and streaming on your TV.'],
      ['Wireless HDMI Display Adapter', 2999, 0, '📶', 'Mirror your phone to the big screen.'],
    ],
    'TV Accessories': [
      ['Tilting TV Wall Mount 32–65"', 2999, 0, '🔩', 'Low-profile mount with ±15° tilt.'],
      ['Automatic Voltage Stabiliser', 4999, 5999, '⚡', 'Protects your TV from surges and low voltage.'],
      ['4K HDMI Cable 3 m', 999, 0, '🔗', 'High-speed 18 Gbps for 4K HDR.'],
    ],
  },
  Appliances: {
    Refrigeration: [
      ['FrostFree 260 L Fridge-Freezer', 39999, 44999, '🧊', 'Inverter compressor saves energy on generator or solar.'],
      ['Chest Freezer 200 L', 29999, 0, '❄️', 'Holds temperature for hours during power cuts.'],
      ['Mini Fridge 90 L', 14999, 0, '🧃', 'Perfect for bedrooms, shops and offices.'],
    ],
    Laundry: [
      ['Front-Load Washing Machine 7 kg', 44999, 49999, '🫧', '15 programmes including quick wash and hand wash.'],
      ['Twin-Tub Washing Machine 9 kg', 24999, 0, '🫧', 'Wash and spin side by side, low water use.'],
      ['Steam Iron 2400 W', 2999, 0, '👕', 'Ceramic soleplate with vertical steam.'],
    ],
    'Cooling & Fans': [
      ['Inverter Split Air Conditioner 1.5 HP', 49999, 57999, '❄️', 'Fast cooling with low running costs.'],
      ['Rechargeable Standing Fan 18"', 6999, 0, '🌀', 'Runs up to 8 hours on battery during outages.'],
      ['Evaporative Air Cooler 30 L', 9999, 0, '💨', 'Cools large rooms using water and ice packs.'],
    ],
    'Cooking Appliances': [
      ['4-Burner Gas Cooker with Oven', 34999, 39999, '🔥', 'Auto-ignition and a 60 L oven.'],
      ['Microwave Oven 25 L', 9999, 0, '♨️', 'Grill function and 8 auto-cook menus.'],
      ['Induction Hob Double', 7999, 0, '🔥', 'Fast, efficient cooking with child lock.'],
    ],
    'Power & Generators': [
      ['Silent Petrol Generator 3.5 kVA', 59999, 64999, '⚡', 'Key start, low-noise design and 10-hour tank.'],
      ['Solar Home Kit 1 kW', 79999, 0, '☀️', 'Panels, inverter and lithium battery for lights, TV and fridge.'],
      ['Pure Sine Wave Inverter 1.5 kVA', 29999, 0, '🔌', 'Clean backup power for sensitive electronics.'],
    ],
  },
  Automotive: {
    'Car Parts': [
      ['Premium Oil Filter', 999, 0, '🛢️', 'High-efficiency filtration for longer engine life.'],
      ['Ceramic Brake Pads (front set)', 3999, 4999, '🛞', 'Quiet, low-dust stopping power.'],
      ['Maintenance-Free Car Battery 70 Ah', 12999, 0, '🔋', 'Reliable starts in heat and cold.'],
    ],
    'Car Care': [
      ['Car Wash & Wax Shampoo 1 L', 999, 0, '🧽', 'Cleans and protects in one step.'],
      ['Interior Detailing Kit', 2499, 2999, '🧴', 'Dashboard, leather and glass care.'],
      ['Microfibre Drying Towel XL', 1299, 0, '🧽', 'Absorbs 7× its weight for a streak-free finish.'],
    ],
    'Car Electronics': [
      ['Full HD Dash Cam', 4999, 5999, '📹', 'Loop recording, G-sensor and night vision.'],
      ['Bluetooth FM Transmitter', 1999, 0, '📻', 'Hands-free calls and music, dual USB charging.'],
      ['Reversing Camera Kit', 3999, 0, '📷', 'Wide-angle camera with guide lines.'],
    ],
    'Motorbike Gear': [
      ['Full-Face Certified Helmet', 5999, 6999, '🪖', 'Certified shell with anti-fog visor.'],
      ['Riding Gloves with Knuckle Guard', 1999, 0, '🧤', 'Breathable mesh with touchscreen fingertips.'],
      ['Motorbike Chain Lube', 899, 0, '🛢️', 'Reduces wear and repels dust.'],
    ],
    'Tyres & Wheels': [
      ['Digital Tyre Inflator', 3999, 4999, '🛞', 'Cordless, auto-stop at your set pressure.'],
      ['Tyre Repair Kit', 1499, 0, '🔧', 'Plugs and tools to fix punctures on the road.'],
      ['Wheel Lock Nut Set', 1999, 0, '🔩', 'Protects alloy wheels from theft.'],
    ],
    'Safety & Tools': [
      ['Portable Jump Starter 1000 A', 6999, 7999, '⚡', 'Starts cars up to 6 L petrol, doubles as a power bank.'],
      ['Emergency Roadside Kit', 3499, 0, '🚨', 'Warning triangle, jumper cables and first-aid kit.'],
      ['Hydraulic Trolley Jack 2 T', 4999, 0, '🔧', 'Quick-lift for tyre changes.'],
    ],
  },
  Books: {
    Fiction: [
      ['The River Between Us — Novel', 1499, 0, '📕', 'A sweeping family saga across three generations.'],
      ['Harmattan Nights — Short Stories', 1299, 1599, '📗', 'Twelve stories of love, loss and city life.'],
      ['The Last Caravan — Thriller', 1399, 0, '📘', 'A gripping chase across the Sahel.'],
    ],
    'Non-Fiction': [
      ['Building Wealth from Scratch', 1799, 0, '📙', 'Practical money lessons for young professionals.'],
      ['Leaders of the Continent — Biography', 1999, 2499, '📗', 'Profiles of visionaries who shaped modern Africa.'],
      ['Start Small, Grow Big', 1599, 0, '📘', 'A field guide to launching your small business.'],
    ],
    'Textbooks & Education': [
      ['Mathematics Exam Prep (Secondary)', 1999, 0, '📐', 'Worked examples and past papers with answers.'],
      ['English Grammar in Practice', 1799, 2199, '📝', 'Clear explanations with hundreds of exercises.'],
      ['Introduction to Programming', 2999, 0, '💻', 'Learn to code with Python, step by step.'],
    ],
    'Children’s Books': [
      ['Ama and the Moon — Picture Book', 999, 0, '🌙', 'A bedtime story about courage and curiosity.'],
      ['My First 100 Words (Board Book)', 799, 999, '🔤', 'Bright photos for toddlers.'],
      ['The Great Football Mystery', 1199, 0, '⚽', 'A chapter book adventure for ages 8–11.'],
    ],
    'Religion & Spirituality': [
      ['Daily Devotional Journal', 1499, 0, '📖', '365 reflections with space to write.'],
      ['Study Bible — Large Print', 2999, 3499, '📖', 'Easy-to-read type with study notes.'],
      ['Illustrated Quran Stories for Kids', 1499, 0, '📚', 'Beautifully illustrated stories for young readers.'],
    ],
  },
  Grocery: {
    'Pantry Staples': [
      ['Premium Long-Grain Rice 25 kg', 3999, 4499, '🍚', 'Clean, fluffy grains for family meals.'],
      ['Pure Vegetable Oil 5 L', 1499, 0, '🫗', 'Cholesterol-free oil for frying and cooking.'],
      ['Spaghetti (20 × 500 g)', 1999, 0, '🍝', 'Durum wheat pasta — a pantry essential.'],
    ],
    Beverages: [
      ['Natural Mineral Water (12 × 1.5 L)', 999, 0, '💧', 'Pure, balanced spring water.'],
      ['Hibiscus Bissap Juice (6 × 1 L)', 1299, 1499, '🌺', 'Refreshing hibiscus drink with ginger.'],
      ['Ground Arabica Coffee 500 g', 1199, 0, '☕', 'Medium roast with chocolate notes.'],
    ],
    Snacks: [
      ['Roasted Peanuts (12 packs)', 899, 0, '🥜', 'Crunchy salted groundnuts for snacking.'],
      ['Plantain Chips Variety Box', 1199, 1399, '🍌', 'Sweet and spicy plantain chips.'],
      ['Butter Shortbread Biscuits Tin', 999, 0, '🍪', 'Classic biscuits for sharing.'],
    ],
    'Spices & Condiments': [
      ['Suya Spice Mix 250 g', 699, 0, '🌶️', 'Smoky peanut-chilli blend for grills.'],
      ['Seasoning Cubes (100)', 899, 0, '🧂', 'Rich flavour for soups and stews.'],
      ['Hot Pepper Sauce 500 ml', 599, 799, '🌶️', 'Fiery scotch-bonnet sauce.'],
    ],
    'Household Supplies': [
      ['Laundry Detergent Powder 5 kg', 1499, 1799, '🧺', 'Tough on stains, gentle on colours.'],
      ['Toilet Tissue (24 rolls)', 1299, 0, '🧻', 'Soft, strong 2-ply rolls.'],
      ['Antibacterial Hand Soap (4 × 500 ml)', 999, 0, '🧼', 'Kills 99.9% of germs, with aloe.'],
    ],
  },
  Health: {
    'Vitamins & Supplements': [
      ['Daily Multivitamin (90 tablets)', 1499, 1799, '💊', 'Essential vitamins and minerals for adults.'],
      ['Vitamin D3 + K2 Drops', 1299, 0, '☀️', 'Supports bones and immunity.'],
      ['Omega-3 Fish Oil (120 softgels)', 1799, 0, '🐟', 'EPA and DHA for heart and brain health.'],
    ],
    'Personal Care': [
      ['Sonic Electric Toothbrush', 3999, 4999, '🪥', 'Five modes, two-minute timer and travel case.'],
      ['Herbal Toothpaste (3-pack)', 799, 0, '🦷', 'Fluoride protection with neem and clove.'],
      ['Menstrual Cup with Pouch', 1299, 0, '🌸', 'Reusable medical-grade silicone, up to 12 hours.'],
    ],
    'Health Monitors': [
      ['Upper-Arm Blood Pressure Monitor', 3999, 4999, '🩺', 'Clinically validated with irregular-heartbeat alert.'],
      ['Infrared Forehead Thermometer', 1999, 0, '🌡️', 'One-second readings with fever alarm.'],
      ['Fingertip Pulse Oximeter', 1999, 0, '❤️', 'Measures SpO₂ and pulse rate.'],
    ],
    'First Aid': [
      ['Home First Aid Kit (100 pieces)', 2499, 0, '🩹', 'Plasters, bandages, antiseptic wipes and more.'],
      ['Elastic Bandage Wraps (4)', 799, 0, '🩹', 'Support for sprains and strains.'],
      ['Instant Cold Packs (6)', 999, 1199, '🧊', 'Squeeze to activate — no freezer needed.'],
    ],
    'Mobility & Support': [
      ['Adjustable Walking Stick', 1999, 0, '🦯', 'Lightweight aluminium with non-slip tip.'],
      ['Lumbar Back Support Belt', 2499, 2999, '🧍', 'Breathable support for lifting and posture.'],
      ['Shower Seat with Backrest', 3999, 0, '🚿', 'Height-adjustable and rust-proof.'],
    ],
  },
  'Pet Supplies': {
    'Dog Supplies': [
      ['Adult Dog Dry Food 10 kg', 3999, 4499, '🐕', 'Complete nutrition with real chicken.'],
      ['Reflective Dog Lead & Collar', 1499, 0, '🦮', 'Padded, adjustable and visible at night.'],
      ['Orthopaedic Dog Bed (L)', 4999, 0, '🛏️', 'Memory foam for joints, washable cover.'],
    ],
    'Cat Supplies': [
      ['Indoor Cat Food 4 kg', 2499, 0, '🐈', 'Hairball control with salmon.'],
      ['Clumping Cat Litter 10 L', 1299, 1499, '🐾', 'Odour-locking, low-dust formula.'],
      ['Cat Scratching Post Tower', 3499, 0, '🐱', 'Sisal posts with a cosy hideaway.'],
    ],
    'Birds & Fish': [
      ['Starter Aquarium Kit 30 L', 5999, 6999, '🐠', 'Tank, filter, LED light and heater.'],
      ['Bird Cage with Stand', 4999, 0, '🐦', 'Spacious cage with perches and feeders.'],
      ['Tropical Fish Flakes 200 g', 699, 0, '🐟', 'Balanced nutrition for vibrant colour.'],
    ],
    'Grooming & Health': [
      ['Self-Cleaning Slicker Brush', 1499, 0, '🪮', 'Removes loose fur with one click.'],
      ['Gentle Oatmeal Pet Shampoo', 999, 1199, '🛁', 'Soothes sensitive skin.'],
      ['Nail Clipper with Guard', 899, 0, '✂️', 'Safe trimming at home.'],
    ],
    'Livestock & Poultry': [
      ['Layer Mash Poultry Feed 25 kg', 2499, 0, '🐔', 'Balanced feed for strong shells and steady laying.'],
      ['Automatic Poultry Drinker 10 L', 1499, 1799, '💧', 'Clean water all day for your flock.'],
      ['Goat & Sheep Mineral Lick', 999, 0, '🐐', 'Essential minerals for healthy herds.'],
    ],
  },
  Baby: {
    'Nappies & Wipes': [
      ['Ultra-Dry Nappies Size 3 (84)', 2499, 2999, '👶', '12-hour dryness with a wetness indicator.'],
      ['Sensitive Baby Wipes (6 × 64)', 1299, 0, '🧻', '99% water, fragrance-free.'],
      ['Portable Changing Mat', 1499, 0, '🧷', 'Wipe-clean, folds into a clutch.'],
    ],
    Feeding: [
      ['Anti-Colic Baby Bottles (3)', 1999, 0, '🍼', 'Vented to reduce gas and fussiness.'],
      ['Electric Breast Pump', 7999, 9999, '🍼', 'Quiet double pump with memory function.'],
      ['Silicone Bib & Plate Set', 1499, 0, '🥣', 'Suction plate that stays put.'],
    ],
    'Strollers & Car Seats': [
      ['Lightweight Travel Stroller', 12999, 14999, '🛒', 'One-hand fold, 5-point harness, under 7 kg.'],
      ['Convertible Car Seat 0–18 kg', 14999, 0, '💺', 'Rear- and forward-facing with side-impact protection.'],
      ['Ergonomic Baby Carrier', 4999, 0, '🤱', 'Hip-healthy positions from newborn to toddler.'],
    ],
    Nursery: [
      ['Wooden Cot with Mattress', 19999, 0, '🛏️', 'Three base heights, converts to toddler bed.'],
      ['Video Baby Monitor', 7999, 8999, '📹', 'Night vision, two-way talk and lullabies.'],
      ['Muslin Swaddle Blankets (3)', 1999, 0, '🧸', 'Breathable cotton muslin, soft with every wash.'],
    ],
    'Baby Clothing': [
      ['Organic Cotton Bodysuits (5)', 1999, 0, '👕', 'Envelope necks and snap closures.'],
      ['Footed Sleepsuits (3)', 2499, 2999, '🧸', 'Zip-up sleepsuits for easy changes.'],
      ['Newborn Gift Set (6 pieces)', 2999, 0, '🎁', 'Hat, mittens, bodysuits and blanket.'],
    ],
    'Bath & Care': [
      ['Foldable Baby Bath Tub', 2999, 0, '🛁', 'Temperature-sensing plug and non-slip base.'],
      ['Gentle Baby Wash & Shampoo', 999, 0, '🫧', 'Tear-free, hypoallergenic formula.'],
      ['Baby Grooming Kit (10 pieces)', 1499, 1799, '🧴', 'Nail clipper, brush, thermometer and more.'],
    ],
  },
  Jewelry: {
    'Necklaces & Pendants': [
      ['Sterling Silver Africa Pendant', 3999, 4999, '📿', '925 silver map pendant on a 45 cm chain.'],
      ['18K Gold-Plated Herringbone Chain', 2999, 0, '✨', 'Sleek flat chain that catches the light.'],
      ['Freshwater Pearl Necklace', 5999, 0, '🦪', 'Hand-knotted pearls with a silver clasp.'],
    ],
    Earrings: [
      ['Gold Hoop Earrings 30 mm', 2499, 0, '⭕', 'Lightweight everyday hoops.'],
      ['Crystal Stud Earrings', 1999, 2499, '💎', 'Brilliant-cut crystals in sterling silver.'],
      ['Beaded Tassel Drop Earrings', 1499, 0, '🎐', 'Colourful handmade statement earrings.'],
    ],
    Rings: [
      ['Sterling Silver Stacking Rings (3)', 2999, 0, '💍', 'Mix-and-match bands in 925 silver.'],
      ['Solitaire Engagement Ring', 29999, 34999, '💍', '18K white gold with a certified stone.'],
      ['Men’s Brushed Steel Band', 1999, 0, '💍', 'Comfort-fit titanium steel.'],
    ],
    'Bracelets & Bangles': [
      ['Gold-Plated Bangle Set (6)', 2499, 2999, '🟡', 'Stackable bangles with a textured finish.'],
      ['Leather Wrap Bracelet', 1499, 0, '🪢', 'Braided leather with a magnetic clasp.'],
      ['Charm Bracelet Starter', 3999, 0, '🔮', 'Silver bracelet with three charms.'],
    ],
    'Traditional Jewellery': [
      ['Cowrie Shell Necklace', 1999, 0, '🐚', 'Handmade with natural cowrie shells.'],
      ['Waist Beads Set (3)', 1299, 1599, '📿', 'Hand-strung glass beads in vibrant colours.'],
      ['Coral Bead Ceremonial Set', 7999, 0, '🔴', 'Necklace and bracelet for weddings and festivals.'],
    ],
  },
  Watches: {
    'Men’s Watches': [
      ['Navigator Chronograph Watch', 8999, 10999, '⌚', 'Stainless steel, sapphire-coated glass, 100 m WR.'],
      ['Classic Leather Dress Watch', 5999, 0, '⌚', 'Slim case with a genuine leather strap.'],
      ['Field Automatic Watch', 14999, 0, '⌚', 'Self-winding movement with exhibition caseback.'],
    ],
    'Women’s Watches': [
      ['Rose Gold Mesh Watch', 6999, 7999, '⌚', 'Minimalist dial with a mesh bracelet.'],
      ['Crystal Bezel Bracelet Watch', 7999, 0, '⌚', 'Sparkling bezel for special occasions.'],
      ['Everyday Canvas Strap Watch', 3999, 0, '⌚', 'Lightweight and easy to read.'],
    ],
    Smartwatches: [
      ['Kora Smartwatch S2 Lite', 7999, 9999, '⌚', 'Health tracking, notifications and 10-day battery.'],
      ['Kora Active GPS Watch', 14999, 0, '⌚', 'Built-in GPS for runs and rides.'],
      ['Kora Call Smartwatch', 9999, 0, '⌚', 'Answer calls from your wrist.'],
    ],
    'Kids’ Watches': [
      ['Time Teacher Kids Watch', 1999, 0, '⏱️', 'Labelled dial that makes learning time easy.'],
      ['Digital Sports Watch for Kids', 1799, 2299, '⌚', 'Stopwatch, alarm and backlight.'],
      ['Kora Kids GPS Watch', 5999, 0, '📍', 'Location sharing and SOS calling.'],
    ],
    'Straps & Accessories': [
      ['Quick-Release Leather Strap', 1499, 0, '🪢', 'Tool-free swap in 20 or 22 mm.'],
      ['Watch Winder for Automatics', 4999, 5999, '🔄', 'Keeps automatic watches running.'],
      ['Travel Watch Roll (3 slots)', 2499, 0, '🧳', 'Protects watches on the move.'],
    ],
  },
  Bags: {
    Handbags: [
      ['Structured Leather Tote', 7999, 9999, '👜', 'Fits a 13" laptop, with zip inner pocket.'],
      ['Crossbody Saddle Bag', 3999, 0, '👛', 'Adjustable strap and magnetic flap.'],
      ['Evening Clutch', 2999, 0, '👝', 'Satin finish with a detachable chain.'],
    ],
    Backpacks: [
      ['CityPack Anti-Theft Backpack', 4999, 5999, '🎒', 'Hidden zips, USB charging port, water-resistant.'],
      ['School Backpack with Lunch Bag', 2999, 0, '🎒', 'Padded straps and reflective strips.'],
      ['Roll-Top Waterproof Backpack', 5999, 0, '🎒', 'Keeps gear dry in heavy rain.'],
    ],
    'Travel & Luggage': [
      ['Hard-Shell Cabin Suitcase 55 cm', 8999, 10999, '🧳', 'Fits most cabin limits, 360° spinner wheels.'],
      ['Luggage Set (3 sizes)', 19999, 0, '🧳', 'Nesting hard-shell cases with TSA locks.'],
      ['Foldable Duffel Bag 60 L', 2499, 0, '👜', 'Packs flat into its own pocket.'],
    ],
    'Laptop Bags': [
      ['Padded Laptop Sleeve 15.6"', 1999, 0, '💼', 'Shock-absorbing foam with accessory pocket.'],
      ['Executive Laptop Briefcase', 5999, 6999, '💼', 'Organised compartments for work essentials.'],
      ['Convertible Laptop Backpack', 4999, 0, '🎒', 'Switch between briefcase and backpack.'],
    ],
    'Wallets & Small Goods': [
      ['Slim RFID Card Wallet', 1999, 2499, '👛', 'Holds 8 cards and blocks skimming.'],
      ['Bifold Leather Wallet', 2999, 0, '👛', 'Full-grain leather with coin pocket.'],
      ['Travel Document Organiser', 2499, 0, '🛂', 'Passport, cards, boarding passes and pen.'],
    ],
  },
  Office: {
    Stationery: [
      ['Hardcover Notebook A5 (3-pack)', 1499, 0, '📓', 'Dotted pages on thick 100 gsm paper.'],
      ['Gel Pen Set (24 colours)', 999, 1299, '🖊️', 'Smooth, quick-drying ink.'],
      ['Desk Organiser with Drawers', 2499, 0, '🗂️', 'Keeps pens, notes and clips in reach.'],
    ],
    'Office Furniture': [
      ['Ergonomic Mesh Office Chair', 14999, 17999, '🪑', 'Lumbar support, adjustable arms and headrest.'],
      ['Height-Adjustable Standing Desk', 29999, 0, '🗄️', 'Electric lift with memory presets.'],
      ['3-Drawer Mobile Filing Cabinet', 9999, 0, '🗄️', 'Lockable steel cabinet on castors.'],
    ],
    'School Supplies': [
      ['Exercise Books (20 × 80 pages)', 999, 0, '📒', 'Ruled pages for every subject.'],
      ['Scientific Calculator', 1499, 1799, '🧮', '240 functions, approved for exams.'],
      ['Geometry Set (9 pieces)', 699, 0, '📐', 'Compass, protractor, rulers and more.'],
    ],
    'Office Electronics': [
      ['Cross-Cut Paper Shredder', 6999, 0, '🗑️', 'Shreds 8 sheets and credit cards.'],
      ['Mini Portable Projector', 9999, 12999, '📽️', 'Present from your laptop or phone anywhere.'],
      ['Desktop Printing Calculator', 3499, 0, '🧾', 'Two-colour printing for bookkeeping.'],
    ],
    'Packaging & Shipping': [
      ['Shipping Boxes (25)', 1999, 0, '📦', 'Strong corrugated boxes for small parcels.'],
      ['Packing Tape (6 rolls)', 899, 0, '📦', 'Clear, strong and quiet-release.'],
      ['Thermal Label Printer', 7999, 8999, '🏷️', 'Prints shipping labels without ink.'],
    ],
  },
  Garden: {
    'Plants & Seeds': [
      ['Vegetable Seed Starter Pack (10)', 1499, 0, '🌱', 'Tomato, pepper, okra, spinach and more.'],
      ['Potted Snake Plant', 2499, 2999, '🪴', 'Hardy, low-light houseplant that purifies air.'],
      ['Organic Potting Soil 20 L', 999, 0, '🌿', 'Enriched with compost for strong roots.'],
    ],
    'Garden Tools': [
      ['Garden Tool Set (5 pieces)', 2999, 0, '🪴', 'Trowel, fork, pruner, weeder and gloves.'],
      ['Heavy-Duty Hoe', 1499, 0, '⛏️', 'Forged steel head with hardwood handle.'],
      ['Bypass Pruning Shears', 1499, 1999, '✂️', 'Clean cuts on branches up to 20 mm.'],
    ],
    'Outdoor Furniture': [
      ['Rattan Patio Set (4 pieces)', 34999, 39999, '🪑', 'Weather-resistant rattan with cushions.'],
      ['Folding Garden Chairs (2)', 4999, 0, '🪑', 'Lightweight and easy to store.'],
      ['Garden Parasol 2.7 m', 5999, 0, '⛱️', 'UV-protective canopy with tilt.'],
    ],
    'Watering & Irrigation': [
      ['Drip Irrigation Kit (30 plants)', 2999, 3499, '💧', 'Saves water and feeds roots directly.'],
      ['Expandable Garden Hose 15 m', 1999, 0, '🚿', 'Lightweight hose with 7-pattern spray nozzle.'],
      ['Watering Can 10 L', 1299, 0, '🪣', 'Balanced design with a fine rose.'],
    ],
    'Outdoor Lighting': [
      ['Solar Security Floodlight', 3999, 4999, '🔦', 'Motion-activated 1000 lumen light.'],
      ['Solar Pathway Lights (8)', 2499, 0, '🌟', 'Line paths with warm light.'],
      ['Solar String Lights 20 m', 1999, 0, '✨', '200 LEDs with 8 lighting modes.'],
    ],
  },
  Tools: {
    'Power Tools': [
      ['Cordless Drill Driver 20 V', 7999, 9999, '🔩', 'Two batteries, charger and 30-piece bit set.'],
      ['Angle Grinder 115 mm', 4999, 0, '⚙️', '800 W with safety guard and side handle.'],
      ['Circular Saw 1400 W', 8999, 0, '🪚', 'Cuts timber up to 55 mm with laser guide.'],
    ],
    'Hand Tools': [
      ['Mechanic Tool Set (108 pieces)', 5999, 6999, '🔧', 'Sockets, spanners and bits in a carry case.'],
      ['Claw Hammer 450 g', 1299, 0, '🔨', 'Shock-absorbing fibreglass handle.'],
      ['Precision Screwdriver Set (32)', 1499, 0, '🪛', 'For phones, laptops and electronics.'],
    ],
    Electrical: [
      ['Digital Multimeter', 2499, 2999, '🔌', 'Measures voltage, current and resistance safely.'],
      ['Extension Socket with Surge Protection', 1999, 0, '🔌', 'Six sockets and two USB ports.'],
      ['Copper Electrical Cable 2.5 mm (50 m)', 4999, 0, '🧵', 'Standard household wiring cable.'],
    ],
    Plumbing: [
      ['Adjustable Pipe Wrench Set', 2499, 0, '🔧', '10" and 14" wrenches for pipe work.'],
      ['Kitchen Mixer Tap', 3999, 4999, '🚰', 'Swivel spout with pull-out sprayer.'],
      ['PTFE Thread Seal Tape (10)', 599, 0, '🧻', 'Leak-free pipe joints.'],
    ],
    'Safety Equipment': [
      ['Safety Helmet with Visor', 1999, 0, '⛑️', 'Impact-rated hard hat with face shield.'],
      ['Anti-Fog Safety Goggles', 999, 1299, '🥽', 'Wraparound protection with vented frame.'],
      ['Cut-Resistant Work Gloves (3 pairs)', 1499, 0, '🧤', 'Level-5 protection with grip coating.'],
    ],
    'Measuring & Layout': [
      ['Laser Distance Measure 40 m', 3999, 4999, '📏', 'Measures distance, area and volume instantly.'],
      ['Spirit Level 60 cm', 1299, 0, '📐', 'Aluminium body with three vials.'],
      ['Steel Tape Measure 8 m', 999, 0, '📏', 'Auto-lock blade with belt clip.'],
    ],
  },
  'Arts & Crafts': {
    'Painting & Drawing': [
      ['Acrylic Paint Set (24 colours)', 1999, 2499, '🎨', 'Rich, fast-drying pigments for canvas and wood.'],
      ['Stretched Canvas Panels (5)', 1499, 0, '🖼️', 'Primed cotton canvas, 30 × 40 cm.'],
      ['Sketching Pencil Set (12)', 999, 0, '✏️', 'Graphite grades from 6H to 8B.'],
    ],
    'Sewing & Fabric': [
      ['Wax Print Fabric — 6 Yards', 2999, 3499, '🧵', '100% cotton wax print, vivid and colourfast.'],
      ['Portable Sewing Machine', 9999, 0, '🪡', '12 stitch patterns, ideal for beginners.'],
      ['Sewing Kit (100 pieces)', 1299, 0, '🧷', 'Needles, threads, scissors and tape.'],
    ],
    'Beading & Jewellery Making': [
      ['Glass Seed Bead Kit (5,000)', 1499, 0, '📿', 'Mixed colours with organiser box.'],
      ['Jewellery Pliers Set (3)', 1499, 1799, '🛠️', 'Round, flat and cutter pliers.'],
      ['Clasp & Findings Kit', 999, 0, '🔗', 'Clasps, jump rings and crimp beads.'],
    ],
    'Craft Supplies': [
      ['Hot Glue Gun with 30 Sticks', 1299, 0, '🔥', 'Fast-heating for crafts and repairs.'],
      ['Coloured Card Stock (100 sheets)', 999, 1299, '📄', 'A4 card in 20 colours.'],
      ['Craft Scissors Set (6 edges)', 899, 0, '✂️', 'Decorative edges for cards and scrapbooks.'],
    ],
    'Kids’ Crafts': [
      ['Washable Finger Paint Set', 999, 0, '🖐️', 'Non-toxic paints for little hands.'],
      ['Make-Your-Own Bracelet Kit', 1299, 1599, '📿', 'Beads, letters and cord — ages 6+.'],
      ['Air-Dry Modelling Clay (12 colours)', 1199, 0, '🧸', 'No oven needed, dries in 24 hours.'],
    ],
  },
  'Musical Instruments': {
    'Guitars & Bass': [
      ['Acoustic Guitar Beginner Bundle', 12999, 14999, '🎸', 'Full-size guitar with bag, tuner, strap and picks.'],
      ['Electric Guitar with 10 W Amp', 19999, 0, '🎸', 'Everything you need to plug in and play.'],
      ['4-String Bass Guitar', 22999, 0, '🎸', 'Solid body with punchy split-coil pickup.'],
    ],
    'Keyboards & Pianos': [
      ['61-Key Portable Keyboard', 9999, 11999, '🎹', 'Touch-sensitive keys and 400 sounds.'],
      ['88-Key Digital Piano', 39999, 0, '🎹', 'Weighted hammer-action keys with pedal.'],
      ['Mini MIDI Controller 25-Key', 6999, 0, '🎛️', 'Make music on your laptop.'],
    ],
    'Drums & Percussion': [
      ['Hand-Carved Djembe 60 cm', 9999, 0, '🪘', 'Goat-skin head, carved from a single log.'],
      ['Talking Drum with Stick', 5999, 6999, '🪘', 'Traditional tension drum for expressive rhythms.'],
      ['5-Piece Junior Drum Kit', 19999, 0, '🥁', 'Kit with cymbal, throne and sticks.'],
    ],
    'Studio & Recording': [
      ['USB Condenser Microphone Kit', 6999, 8999, '🎙️', 'Boom arm, pop filter and shock mount.'],
      ['2-Channel Audio Interface', 9999, 0, '🎚️', 'Studio-quality recording for vocals and instruments.'],
      ['Studio Monitor Headphones', 7999, 0, '🎧', 'Flat, accurate sound for mixing.'],
    ],
    'Instrument Accessories': [
      ['Clip-On Chromatic Tuner', 999, 0, '🎵', 'Fast, accurate tuning for any instrument.'],
      ['Guitar Strings (3 sets)', 1499, 1799, '🎼', 'Bright, long-lasting phosphor bronze.'],
      ['Adjustable Music Stand', 1999, 0, '🎼', 'Folds compact with a carry bag.'],
    ],
  },
};

module.exports = { DEMO_CATALOG };
