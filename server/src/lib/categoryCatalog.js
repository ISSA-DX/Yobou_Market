// Curated catalogue content for every Yobou category.
//
// This is the single source of truth for the category list that ships
// with a fresh install AND for the editorial content shown on each
// category page (tagline, intro, subcategories, buying guide, FAQs).
//
// How it reaches the database: `backfillCategories` in
// routes/categories.js seeds each Category row's content and its
// Subcategory rows exactly once (tracked by Category.contentSeededAt).
// After that the Admin owns the content — edits made in the admin
// Categories page are never overwritten by a reboot, and a subcategory
// the admin deletes is not resurrected.
//
// Writing rules for this file:
//   - No prices, discounts or delivery promises: those vary by vendor
//     and region. Point shoppers at the product page for specifics.
//   - Icons are Material Symbols names (the same set the apps render).
//   - Keep subcategory descriptions to one sentence — they render on
//     small tiles in the shopper app.

const CATEGORY_CATALOG = [
  {
    name: 'Electronics',
    icon: 'devices',
    featured: true,
    tagline: 'Smart devices and accessories for work, play and everything between.',
    description:
      'From noise-cancelling earbuds to action cameras and smart-home gear, Electronics brings together the devices that keep you connected and entertained. Every listing shows its specifications, warranty terms and seller up front, so you can compare with confidence.',
    subcategories: [
      { name: 'Audio & Headphones', icon: 'headphones', description: 'Earbuds, headphones and portable speakers for every listening style.' },
      { name: 'Wearables', icon: 'watch', description: 'Smartwatches and fitness trackers that keep your health in view.' },
      { name: 'Cameras & Drones', icon: 'photo_camera', description: 'Action cams, mirrorless bodies and drones for capturing every angle.' },
      { name: 'Smart Home', icon: 'home_iot_device', description: 'Plugs, bulbs, cameras and hubs that make your home work for you.' },
      { name: 'Power & Charging', icon: 'battery_charging_full', description: 'Power banks, chargers and cables to keep every device running.' },
      { name: 'Accessories', icon: 'cable', description: 'Adapters, storage, stands and the small parts that complete a setup.' },
    ],
    guide: [
      { title: 'Check compatibility first', body: 'Confirm the device supports your phone or computer’s operating system, connector type (USB-C, Lightning, Bluetooth version) and local plug standard before you order.' },
      { title: 'Read the warranty line', body: 'Each listing states whether a manufacturer or seller warranty applies and for how long. Keep your order confirmation — it is your proof of purchase.' },
      { title: 'Look at real-world battery life', body: 'Advertised battery figures are measured in ideal conditions. Customer reviews usually give a more realistic picture of daily use.' },
    ],
    faqs: [
      { q: 'Are the electronics on Yobou genuine?', a: 'Every seller is approved by Yobou before they can list. If an item arrives different from its listing, open a return from your order and our team will step in.' },
      { q: 'What if my device stops working?', a: 'Start with the warranty details on the product page, then contact the seller from your order. If you can’t reach a resolution, Yobou support can mediate.' },
      { q: 'Can I pay with mobile money?', a: 'Yes. Mobile money, card and other supported methods are shown at checkout for your region.' },
    ],
  },
  {
    name: 'Phones',
    icon: 'smartphone',
    featured: false,
    tagline: 'The latest smartphones, plus everything that keeps them protected and powered.',
    description:
      'Shop flagship, mid-range and budget smartphones alongside cases, screen protectors, chargers and more. Listings show storage, RAM, network bands and whether the phone is new or refurbished, so there are no surprises.',
    subcategories: [
      { name: 'Smartphones', icon: 'smartphone', description: 'New and certified refurbished phones from leading brands.' },
      { name: 'Feature Phones', icon: 'phone_android', description: 'Durable, long-battery handsets for calls, texts and mobile money.' },
      { name: 'Cases & Protection', icon: 'shield', description: 'Cases, covers and tempered-glass screen protectors.' },
      { name: 'Chargers & Cables', icon: 'power', description: 'Fast chargers, wireless pads and cables built to last.' },
      { name: 'Phone Accessories', icon: 'add_circle', description: 'Holders, selfie sticks, memory cards and more.' },
    ],
    guide: [
      { title: 'Match the network bands', body: 'Check that the phone supports the 4G/5G bands your mobile operator uses. The specification table on each listing shows supported bands.' },
      { title: 'New, refurbished or open-box?', body: 'Condition is stated on every listing. Refurbished phones are tested and cleaned; open-box items may show light signs of handling.' },
      { title: 'Plan your storage', body: 'Photos, videos and apps add up quickly. If the phone has no memory-card slot, choose at least one storage tier above what you use today.' },
    ],
    faqs: [
      { q: 'Are phones unlocked?', a: 'Most phones are sold unlocked. If a phone is tied to a network, the listing says so clearly in its title and specifications.' },
      { q: 'Does the phone come with a charger?', a: 'Some manufacturers no longer include one. The “In the box” section of the listing lists exactly what you’ll receive.' },
      { q: 'Can I return a phone I’ve opened?', a: 'Return eligibility and the return window are shown on each product page. Keep the original box and accessories to make a return straightforward.' },
    ],
  },
  {
    name: 'Computer',
    icon: 'computer',
    featured: false,
    tagline: 'Laptops, desktops and peripherals for study, business and creative work.',
    description:
      'Find the right machine for the way you work — lightweight laptops for students, powerful desktops for creators and reliable peripherals for every desk. Compare processors, memory and storage side by side on each listing.',
    subcategories: [
      { name: 'Laptops', icon: 'laptop_mac', description: 'Ultrabooks, business laptops and gaming notebooks.' },
      { name: 'Desktops & Monitors', icon: 'desktop_windows', description: 'Towers, all-in-ones and displays for a complete workstation.' },
      { name: 'Keyboards & Mice', icon: 'keyboard', description: 'Wired and wireless input devices for comfort and precision.' },
      { name: 'Storage & Memory', icon: 'sd_card', description: 'SSDs, external drives, flash drives and RAM upgrades.' },
      { name: 'Networking', icon: 'router', description: 'Routers, Wi-Fi extenders and mobile hotspots.' },
      { name: 'Printers & Scanners', icon: 'print', description: 'Home and office printers, ink, toner and scanners.' },
    ],
    guide: [
      { title: 'Choose by workload', body: 'For documents and browsing, 8 GB of RAM and an SSD are plenty. For editing, design or gaming, look for 16 GB or more and a dedicated graphics card.' },
      { title: 'SSD over hard drive', body: 'A solid-state drive makes a computer start and open apps dramatically faster. Prefer an SSD as the main drive whenever possible.' },
      { title: 'Check the ports', body: 'Count the USB, HDMI and charging ports you need. Adapters work, but built-in ports are more reliable day to day.' },
    ],
    faqs: [
      { q: 'Does the laptop come with an operating system?', a: 'The listing states whether Windows, macOS, ChromeOS or Linux is pre-installed, or whether the machine ships without an OS.' },
      { q: 'Which keyboard layout will I receive?', a: 'Keyboard layout (for example QWERTY or AZERTY) is listed in the specifications. Ask the seller from the product page if it isn’t shown.' },
      { q: 'Can I upgrade the memory later?', a: 'Some laptops have soldered memory that can’t be upgraded. Sellers note this in the specifications where it applies.' },
    ],
  },
  {
    name: 'Fashion',
    icon: 'checkroom',
    featured: true,
    tagline: 'Everyday essentials and statement pieces for women, men and kids.',
    description:
      'Discover clothing for every occasion — from breathable linen for warm days to tailored pieces for the office and traditional wear for celebrations. Size guides, fabric details and care instructions are listed on every product.',
    subcategories: [
      { name: 'Women', icon: 'woman', description: 'Dresses, tops, trousers and outfits for every occasion.' },
      { name: 'Men', icon: 'man', description: 'Shirts, trousers, suits and casual wear.' },
      { name: 'Kids', icon: 'child_care', description: 'Comfortable, durable clothing for growing children.' },
      { name: 'Traditional Wear', icon: 'apparel', description: 'Wax prints, boubous, kaftans and ceremonial attire.' },
      { name: 'Accessories', icon: 'styler', description: 'Belts, scarves, hats, sunglasses and ties.' },
    ],
    guide: [
      { title: 'Use the size guide', body: 'Sizes differ between brands. Compare your measurements with the size chart on the listing rather than relying on the size you usually wear.' },
      { title: 'Read the fabric details', body: 'Cotton and linen breathe well in heat; blends with elastane add stretch and keep their shape. Care instructions tell you how to keep the item looking new.' },
      { title: 'Check colour in daylight photos', body: 'Screens show colour differently. Customer photos in reviews often give the most accurate impression of a shade.' },
    ],
    faqs: [
      { q: 'What if the size doesn’t fit?', a: 'Many fashion items can be exchanged or returned. The return window and conditions are shown on each product page.' },
      { q: 'Are colours exactly as pictured?', a: 'Sellers photograph items in natural light where possible, but slight differences between screens are normal.' },
      { q: 'Can I order custom tailoring?', a: 'Some sellers in Traditional Wear offer made-to-measure pieces. Look for “Custom size” in the variant options or message the seller.' },
    ],
  },
  {
    name: 'Shoes',
    icon: 'steps',
    featured: false,
    tagline: 'Sneakers, formal shoes and sandals that are made to be walked in.',
    description:
      'Step into comfort and style with athletic trainers, leather formal shoes, everyday sandals and children’s footwear. Each listing includes sizing in EU, UK and US formats where available.',
    subcategories: [
      { name: 'Sneakers', icon: 'steps', description: 'Lifestyle and performance trainers for everyday wear.' },
      { name: 'Formal Shoes', icon: 'work', description: 'Oxfords, loafers and heels for work and events.' },
      { name: 'Sandals & Slides', icon: 'beach_access', description: 'Breathable open footwear for warm days.' },
      { name: 'Boots', icon: 'hiking', description: 'Ankle boots, work boots and hiking boots.' },
      { name: 'Kids’ Shoes', icon: 'child_care', description: 'Supportive, easy-on shoes for little feet.' },
    ],
    guide: [
      { title: 'Measure your foot', body: 'Measure heel to toe in the evening, when feet are largest, and compare with the seller’s size chart. Between sizes? Go up.' },
      { title: 'Consider the width', body: 'Some styles run narrow. Reviews often mention fit — look for comments like “runs small” or “roomy toe box”.' },
      { title: 'Match the sole to the surface', body: 'Rubber soles grip better on wet or uneven ground; leather soles suit indoor and formal use.' },
    ],
    faqs: [
      { q: 'Which size system is used?', a: 'Listings show EU sizes by default and UK/US equivalents when the seller provides them.' },
      { q: 'Can I exchange for a different size?', a: 'Where the seller supports exchanges, you can request one from your order. Keep the shoes unworn and in their box.' },
      { q: 'How do I clean my shoes?', a: 'Care instructions are included on each listing. As a rule, leather prefers a damp cloth and conditioner; canvas can usually be hand-washed.' },
    ],
  },
  {
    name: 'Beauty',
    icon: 'spa',
    featured: true,
    tagline: 'Skincare, makeup and haircare chosen for real skin and real routines.',
    description:
      'Build a routine that works for you with serums, sunscreens, makeup, fragrances and haircare for every texture. Full ingredient lists, skin-type guidance and expiry information help you shop safely.',
    subcategories: [
      { name: 'Skincare', icon: 'face', description: 'Cleansers, serums, moisturisers and sun protection.' },
      { name: 'Makeup', icon: 'brush', description: 'Foundation, lips, eyes and tools in shades for every skin tone.' },
      { name: 'Haircare', icon: 'content_cut', description: 'Shampoos, treatments, oils and styling for every hair type.' },
      { name: 'Fragrance', icon: 'local_florist', description: 'Perfumes, colognes and body mists.' },
      { name: 'Bath & Body', icon: 'bathtub', description: 'Soaps, body butters, scrubs and lotions.' },
      { name: 'Men’s Grooming', icon: 'face_6', description: 'Shaving, beard care and skincare for men.' },
    ],
    guide: [
      { title: 'Know your skin type', body: 'Oily, dry, combination or sensitive skin each respond differently to ingredients. Listings note the skin types each product is designed for.' },
      { title: 'Patch test new products', body: 'Apply a small amount to the inside of your wrist or behind your ear and wait 24 hours before using a new product on your face.' },
      { title: 'Sunscreen every day', body: 'Daily SPF protects against dark spots and premature ageing for every skin tone. Reapply every two hours when outdoors.' },
    ],
    faqs: [
      { q: 'How do I know a product is authentic?', a: 'Beauty sellers are vetted before listing. Check the batch code and seal on arrival; report anything unusual from your order.' },
      { q: 'Can I return opened cosmetics?', a: 'For hygiene reasons, opened beauty products usually can’t be returned unless faulty. The product page states the exact policy.' },
      { q: 'Where can I find the ingredient list?', a: 'Open the Details tab on any beauty product. Sellers are asked to include the full INCI ingredient list.' },
    ],
  },
  {
    name: 'Home',
    icon: 'chair',
    featured: true,
    tagline: 'Furniture, décor and comforts that turn a house into your home.',
    description:
      'Refresh any room with furniture, lighting, bedding, storage and décor. Dimensions, materials and assembly requirements are listed on every product so you can plan your space with confidence.',
    subcategories: [
      { name: 'Furniture', icon: 'weekend', description: 'Sofas, tables, chairs and beds for every room.' },
      { name: 'Bedding & Bath', icon: 'bed', description: 'Sheets, pillows, duvets and towels.' },
      { name: 'Décor', icon: 'wall_art', description: 'Wall art, mirrors, rugs, vases and scents.' },
      { name: 'Lighting', icon: 'light', description: 'Lamps, ceiling lights and solar lighting.' },
      { name: 'Storage & Organisation', icon: 'shelves', description: 'Shelves, baskets and wardrobes that clear the clutter.' },
      { name: 'Cleaning', icon: 'cleaning_services', description: 'Mops, brooms, vacuums and household cleaners.' },
    ],
    guide: [
      { title: 'Measure twice', body: 'Check the room, the doorways and the stairwell before ordering large furniture. Listings give full dimensions in centimetres.' },
      { title: 'Check assembly', body: 'Listings state whether an item arrives assembled or flat-packed, and which tools you’ll need.' },
      { title: 'Choose easy-care fabrics', body: 'Removable, washable covers and stain-resistant finishes make a big difference in busy homes.' },
    ],
    faqs: [
      { q: 'Is large furniture delivered to my door?', a: 'Delivery options for bulky items are shown at checkout and depend on your address and the seller.' },
      { q: 'Do I need to assemble it myself?', a: 'The listing says whether assembly is required. Some sellers offer assembly as an option.' },
      { q: 'What if an item arrives damaged?', a: 'Photograph the damage and report it from your order within the period stated on the product page so we can arrange a replacement or refund.' },
    ],
  },
  {
    name: 'Kitchen',
    icon: 'blender',
    featured: false,
    tagline: 'Cookware, tools and dining essentials for cooks of every level.',
    description:
      'Equip your kitchen with cookware, small appliances, knives, storage and tableware. Material, capacity and heat-source compatibility are clearly listed, so you choose pieces that work with your stove.',
    subcategories: [
      { name: 'Cookware', icon: 'skillet', description: 'Pots, pans, skillets and bakeware.' },
      { name: 'Small Appliances', icon: 'blender', description: 'Blenders, kettles, air fryers and rice cookers.' },
      { name: 'Knives & Utensils', icon: 'restaurant', description: 'Chef’s knives, boards and everyday tools.' },
      { name: 'Food Storage', icon: 'takeout_dining', description: 'Containers, jars and lunch boxes.' },
      { name: 'Tableware', icon: 'dinner_dining', description: 'Plates, glasses, cutlery and serving dishes.' },
    ],
    guide: [
      { title: 'Match cookware to your hob', body: 'Induction hobs need magnetic bases. Gas and electric work with most materials. The listing shows compatible heat sources.' },
      { title: 'Check capacity', body: 'For appliances like blenders and rice cookers, choose a capacity that matches your household size.' },
      { title: 'Food-safe materials', body: 'Look for BPA-free plastics and food-grade stainless steel for anything that touches food.' },
    ],
    faqs: [
      { q: 'Are appliances sold with a local plug?', a: 'The specifications list plug type and voltage. Make sure they match your local supply before ordering.' },
      { q: 'Is it dishwasher safe?', a: 'Care instructions on each listing say whether an item is dishwasher safe.' },
      { q: 'Do knives come sharpened?', a: 'Yes, new knives arrive sharp. Handle with care when unpacking.' },
    ],
  },
  {
    name: 'Sports',
    icon: 'sports_basketball',
    featured: false,
    tagline: 'Gear for the pitch, the court and the open road.',
    description:
      'Get game-ready with football kit, balls, rackets, cycling gear and outdoor equipment. Find the right size and specification for your sport, whether you’re training for a match or playing for fun.',
    subcategories: [
      { name: 'Football', icon: 'sports_soccer', description: 'Balls, boots, jerseys and training equipment.' },
      { name: 'Basketball', icon: 'sports_basketball', description: 'Balls, hoops and court shoes.' },
      { name: 'Racket Sports', icon: 'sports_tennis', description: 'Tennis, badminton and table-tennis gear.' },
      { name: 'Cycling', icon: 'pedal_bike', description: 'Bikes, helmets, lights and repair kits.' },
      { name: 'Outdoor & Camping', icon: 'camping', description: 'Tents, backpacks and adventure essentials.' },
      { name: 'Sportswear', icon: 'apparel', description: 'Performance tops, shorts and team kits.' },
    ],
    guide: [
      { title: 'Size the ball correctly', body: 'Footballs and basketballs come in age-specific sizes. Size 5 footballs and size 7 basketballs are standard for adults.' },
      { title: 'Prioritise safety gear', body: 'Helmets, shin guards and protective pads should fit snugly. Replace a helmet after any significant impact.' },
      { title: 'Pick breathable fabrics', body: 'Moisture-wicking sportswear keeps you cooler and drier than cotton during hard training.' },
    ],
    faqs: [
      { q: 'Can I order team kits in bulk?', a: 'Many sellers offer quantity options or custom printing. Message the seller from the product page for team orders.' },
      { q: 'Are bikes delivered assembled?', a: 'Bikes usually arrive partly assembled. The listing explains what’s needed to finish the setup.' },
      { q: 'Are the jerseys official?', a: 'Official merchandise is labelled as such. Unlabelled jerseys are fan or training versions.' },
    ],
  },
  {
    name: 'Fitness',
    icon: 'fitness_center',
    featured: false,
    tagline: 'Equipment and nutrition to help you train stronger at home or in the gym.',
    description:
      'Build a home gym or upgrade your training with weights, cardio machines, yoga gear and recovery tools. Every listing shows weight, dimensions and load limits so you can train safely.',
    subcategories: [
      { name: 'Strength Training', icon: 'fitness_center', description: 'Dumbbells, kettlebells, bars and resistance bands.' },
      { name: 'Cardio Equipment', icon: 'directions_run', description: 'Treadmills, bikes, rowers and skipping ropes.' },
      { name: 'Yoga & Pilates', icon: 'self_improvement', description: 'Mats, blocks, straps and balls.' },
      { name: 'Recovery', icon: 'healing', description: 'Foam rollers, massage guns and supports.' },
      { name: 'Sports Nutrition', icon: 'nutrition', description: 'Protein, hydration and energy supplements.' },
    ],
    guide: [
      { title: 'Start adjustable', body: 'Adjustable dumbbells and resistance-band sets save space and grow with your strength.' },
      { title: 'Check the space', body: 'Cardio machines list their footprint and the clearance needed behind them. Measure before ordering.' },
      { title: 'Read supplement labels', body: 'Check the ingredients, serving size and expiry date. Speak to a health professional if you have a medical condition.' },
    ],
    faqs: [
      { q: 'What is the maximum user weight?', a: 'Load limits are listed in the specifications for every machine and bench.' },
      { q: 'Are supplements sealed?', a: 'Supplements must arrive factory-sealed. Do not use a product with a broken seal — report it from your order.' },
      { q: 'Is assembly required?', a: 'Larger equipment is usually flat-packed. The listing lists tools and time needed.' },
    ],
  },
  {
    name: 'Toys',
    icon: 'toys',
    featured: false,
    tagline: 'Play that sparks imagination, learning and laughter at every age.',
    description:
      'Find educational toys, building sets, dolls, outdoor play and games for children of every age. Age recommendations and safety information are shown on every listing to help you choose the right gift.',
    subcategories: [
      { name: 'Educational Toys', icon: 'school', description: 'STEM kits, puzzles and early-learning toys.' },
      { name: 'Building Sets', icon: 'extension', description: 'Blocks and construction sets for young builders.' },
      { name: 'Dolls & Figures', icon: 'face_retouching_natural', description: 'Dolls, action figures and playsets.' },
      { name: 'Outdoor Play', icon: 'park', description: 'Ride-ons, balls, scooters and garden toys.' },
      { name: 'Board Games & Puzzles', icon: 'casino', description: 'Family games and jigsaw puzzles.' },
    ],
    guide: [
      { title: 'Follow the age guidance', body: 'Age labels reflect safety as well as ability. Toys with small parts are not suitable for children under three.' },
      { title: 'Check batteries', body: 'The listing tells you if batteries are needed and whether they are included.' },
      { title: 'Choose open-ended play', body: 'Blocks, art supplies and figures grow with a child and encourage creativity long after the first day.' },
    ],
    faqs: [
      { q: 'Are toys safety tested?', a: 'Sellers state applicable safety markings in the listing. Always supervise young children during play.' },
      { q: 'Can I add a gift message?', a: 'Some sellers offer gift wrapping and notes. Look for the option on the product page or message the seller.' },
      { q: 'Are batteries included?', a: 'The product details say whether batteries are included and which type is needed.' },
    ],
  },
  {
    name: 'Gaming',
    icon: 'sports_esports',
    featured: false,
    tagline: 'Consoles, games and accessories for casual players and competitors.',
    description:
      'Level up with consoles, games, controllers, headsets and PC gaming gear. Listings show platform, region and edition so you buy exactly what works with your setup.',
    subcategories: [
      { name: 'Consoles', icon: 'stadia_controller', description: 'Home and handheld gaming consoles.' },
      { name: 'Video Games', icon: 'sports_esports', description: 'Physical games and digital codes.' },
      { name: 'Controllers', icon: 'gamepad', description: 'Official and third-party controllers.' },
      { name: 'Gaming Headsets', icon: 'headset_mic', description: 'Headsets with clear chat and immersive sound.' },
      { name: 'PC Gaming', icon: 'mouse', description: 'Gaming mice, keyboards, chairs and components.' },
    ],
    guide: [
      { title: 'Check platform and region', body: 'Games and digital codes are tied to a platform and sometimes a region. Confirm both on the listing.' },
      { title: 'Wired vs wireless', body: 'Wired controllers and headsets have the lowest latency; wireless gives freedom of movement.' },
      { title: 'Count your storage', body: 'Modern games are large. Consider an extra storage drive if your console is nearly full.' },
    ],
    faqs: [
      { q: 'How are digital codes delivered?', a: 'Digital codes are shown in your order once payment is confirmed, unless the listing states otherwise.' },
      { q: 'Are consoles region-locked?', a: 'Most current consoles are region-free, but some games and subscriptions are not. The listing will note any restriction.' },
      { q: 'Can I return a game I’ve opened?', a: 'Opened physical games and redeemed codes are usually non-returnable unless faulty. Check the product page for the policy.' },
    ],
  },
  {
    name: 'TV & Audio',
    icon: 'tv',
    featured: false,
    tagline: 'Big screens and rich sound for movie nights and match days.',
    description:
      'Bring the cinema home with smart TVs, soundbars, home theatre systems and streaming devices. Screen size, resolution, smart platform and connectivity are listed side by side.',
    subcategories: [
      { name: 'Televisions', icon: 'tv', description: 'Smart, LED and OLED TVs in every size.' },
      { name: 'Soundbars & Home Theatre', icon: 'speaker', description: 'Soundbars, subwoofers and surround systems.' },
      { name: 'Speakers', icon: 'speaker_group', description: 'Bluetooth, party and bookshelf speakers.' },
      { name: 'Streaming Devices', icon: 'cast', description: 'Sticks and boxes that make any TV smart.' },
      { name: 'TV Accessories', icon: 'settings_remote', description: 'Wall mounts, remotes, cables and stabilisers.' },
    ],
    guide: [
      { title: 'Size to your distance', body: 'A good rule: sitting distance in metres × 40 gives a comfortable screen size in inches for 4K TVs.' },
      { title: 'Protect against power surges', body: 'A voltage stabiliser or surge protector helps protect your TV and audio equipment where power is unstable.' },
      { title: 'Count HDMI ports', body: 'Plan for every device you’ll connect — decoder, console, soundbar — and choose a TV with enough HDMI inputs.' },
    ],
    faqs: [
      { q: 'Does the TV include a wall mount?', a: 'Most TVs ship with a table stand only. The “In the box” section confirms what’s included.' },
      { q: 'Will it receive local channels?', a: 'The listing shows supported tuners (for example DVB-T2). Many viewers use a decoder or streaming device as well.' },
      { q: 'How is a large TV delivered?', a: 'Large screens are packed for protection and delivery options are shown at checkout. Inspect the screen before signing for delivery.' },
    ],
  },
  {
    name: 'Appliances',
    icon: 'kitchen',
    featured: false,
    tagline: 'Reliable appliances that take care of the everyday.',
    description:
      'Shop refrigerators, freezers, washing machines, air conditioners, fans and generators. Energy ratings, capacity and power requirements are listed to help you choose the right size and running cost.',
    subcategories: [
      { name: 'Refrigeration', icon: 'kitchen', description: 'Fridges, freezers and chest coolers.' },
      { name: 'Laundry', icon: 'local_laundry_service', description: 'Washing machines, dryers and irons.' },
      { name: 'Cooling & Fans', icon: 'mode_fan', description: 'Air conditioners, standing fans and air coolers.' },
      { name: 'Cooking Appliances', icon: 'oven', description: 'Cookers, ovens, microwaves and hobs.' },
      { name: 'Power & Generators', icon: 'electric_bolt', description: 'Generators, inverters, solar kits and stabilisers.' },
    ],
    guide: [
      { title: 'Size to your household', body: 'As a guide, plan around 100 litres of fridge capacity for every two people, and 7 kg of wash load for a family of four.' },
      { title: 'Think about running costs', body: 'Inverter compressors and higher energy ratings cost more upfront but use less power — especially important on generator or solar.' },
      { title: 'Check power requirements', body: 'Confirm the voltage and wattage match your supply, and size your generator or inverter to the appliance’s starting load.' },
    ],
    faqs: [
      { q: 'Is installation included?', a: 'Installation varies by seller and product. The listing says whether it’s included or available as an add-on.' },
      { q: 'What warranty do appliances carry?', a: 'Warranty length and who provides it are shown on each product page. Register your product with the manufacturer where possible.' },
      { q: 'Can appliances be delivered to upper floors?', a: 'Delivery options for large items are confirmed at checkout. Let the seller know about stairs or lift access.' },
    ],
  },
  {
    name: 'Automotive',
    icon: 'directions_car',
    featured: false,
    tagline: 'Parts, care and accessories to keep you moving safely.',
    description:
      'Find car and motorbike parts, care products, electronics and safety equipment. Use the vehicle compatibility details on each listing to make sure every part fits first time.',
    subcategories: [
      { name: 'Car Parts', icon: 'build', description: 'Filters, brakes, batteries and replacement parts.' },
      { name: 'Car Care', icon: 'local_car_wash', description: 'Cleaning, polishing and protection products.' },
      { name: 'Car Electronics', icon: 'speed', description: 'Dash cams, car chargers and audio.' },
      { name: 'Motorbike Gear', icon: 'two_wheeler', description: 'Helmets, gloves and motorbike parts.' },
      { name: 'Tyres & Wheels', icon: 'tire_repair', description: 'Tyres, pumps and wheel accessories.' },
      { name: 'Safety & Tools', icon: 'car_crash', description: 'Jump starters, triangles, jacks and first-aid kits.' },
    ],
    guide: [
      { title: 'Match make, model and year', body: 'Check the compatibility list on the listing against your vehicle’s make, model, engine and year before ordering parts.' },
      { title: 'Never compromise on safety parts', body: 'For brakes, tyres and helmets, choose certified products and have critical parts fitted by a qualified mechanic.' },
      { title: 'Keep the old part', body: 'Compare the new part with the old one before fitting — it’s the quickest way to spot a mismatch.' },
    ],
    faqs: [
      { q: 'How do I know a part fits my car?', a: 'Compatibility is listed on the product page. If you’re unsure, message the seller with your vehicle details before ordering.' },
      { q: 'Are helmets certified?', a: 'Certified helmets list their safety standard in the specifications. Always choose a certified helmet.' },
      { q: 'Can I return a part that doesn’t fit?', a: 'Unfitted parts in original packaging can usually be returned. Check the window on the product page.' },
    ],
  },
  {
    name: 'Books',
    icon: 'menu_book',
    featured: false,
    tagline: 'Stories, knowledge and learning for curious minds.',
    description:
      'Browse fiction, non-fiction, school textbooks, children’s books and religious texts in English, French and local languages. Each listing shows format, language, author and edition.',
    subcategories: [
      { name: 'Fiction', icon: 'auto_stories', description: 'Novels, short stories and African literature.' },
      { name: 'Non-Fiction', icon: 'library_books', description: 'Biography, business, history and self-development.' },
      { name: 'Textbooks & Education', icon: 'school', description: 'School and university books and exam guides.' },
      { name: 'Children’s Books', icon: 'child_care', description: 'Picture books, early readers and young adult.' },
      { name: 'Religion & Spirituality', icon: 'church', description: 'Religious texts, devotionals and study guides.' },
    ],
    guide: [
      { title: 'Check the edition', body: 'For textbooks, match the edition and ISBN to your syllabus — page numbers and exercises change between editions.' },
      { title: 'Confirm the language', body: 'Many titles are available in several languages. The listing states the language of the copy you’ll receive.' },
      { title: 'New or pre-owned', body: 'Pre-owned books are graded by condition. Notes and highlights are mentioned in the description.' },
    ],
    faqs: [
      { q: 'Can I order a book that isn’t listed?', a: 'Some booksellers take special orders. Message a seller in Books with the title and ISBN.' },
      { q: 'Are textbooks the latest edition?', a: 'Edition and publication year are shown on each listing.' },
      { q: 'Do you sell e-books?', a: 'Yobou currently lists physical books. Any digital edition is clearly marked.' },
    ],
  },
  {
    name: 'Grocery',
    icon: 'local_grocery_store',
    featured: false,
    tagline: 'Pantry staples, fresh favourites and household essentials.',
    description:
      'Stock up on rice, oils, spices, snacks, drinks and household supplies from trusted local sellers. Pack sizes, origin and best-before dates are listed so you can plan your shop.',
    subcategories: [
      { name: 'Pantry Staples', icon: 'grain', description: 'Rice, flour, pasta, oils and canned goods.' },
      { name: 'Beverages', icon: 'local_cafe', description: 'Water, juices, tea, coffee and soft drinks.' },
      { name: 'Snacks', icon: 'cookie', description: 'Biscuits, crisps, nuts and sweets.' },
      { name: 'Spices & Condiments', icon: 'soup_kitchen', description: 'Seasonings, sauces and local spice blends.' },
      { name: 'Household Supplies', icon: 'sanitizer', description: 'Detergent, tissue, soap and cleaning supplies.' },
    ],
    guide: [
      { title: 'Check best-before dates', body: 'Sellers list the minimum shelf life on arrival. Plan bulk purchases around how quickly you’ll use them.' },
      { title: 'Buy staples in bulk', body: 'Larger pack sizes of rice, oil and detergent usually offer better value per kilogram or litre.' },
      { title: 'Store correctly', body: 'Keep dry goods sealed and away from heat and moisture to preserve freshness.' },
    ],
    faqs: [
      { q: 'How fresh are grocery items?', a: 'Every listing shows the minimum shelf life at delivery. Report anything past its date from your order.' },
      { q: 'Is there a minimum order?', a: 'Some grocery sellers set a minimum order value, shown on the product page and at checkout.' },
      { q: 'Can I return food items?', a: 'Food can’t be returned for change of mind, but damaged or expired items are refunded or replaced.' },
    ],
  },
  {
    name: 'Health',
    icon: 'medical_services',
    featured: false,
    tagline: 'Everyday wellness, personal care and home health devices.',
    description:
      'Look after yourself and your family with vitamins, personal care, first-aid supplies and home health monitors. Product details include usage guidance and safety information. Always follow the advice of a qualified health professional.',
    subcategories: [
      { name: 'Vitamins & Supplements', icon: 'pill', description: 'Daily vitamins, minerals and wellness supplements.' },
      { name: 'Personal Care', icon: 'clean_hands', description: 'Oral care, hygiene and intimate care products.' },
      { name: 'Health Monitors', icon: 'monitor_heart', description: 'Blood-pressure monitors, thermometers and glucose meters.' },
      { name: 'First Aid', icon: 'medical_services', description: 'Kits, bandages, antiseptics and supports.' },
      { name: 'Mobility & Support', icon: 'accessible', description: 'Walking aids, braces and daily-living aids.' },
    ],
    guide: [
      { title: 'Supplements are not medicine', body: 'Supplements support a balanced diet but don’t replace medical treatment. Ask a pharmacist or doctor before starting new supplements.' },
      { title: 'Calibrated devices', body: 'For health monitors, choose devices that list clinical validation and keep the batteries fresh for accurate readings.' },
      { title: 'Check expiry and seals', body: 'Make sure products arrive sealed and well within their expiry date.' },
    ],
    faqs: [
      { q: 'Do you sell prescription medicines?', a: 'No. Yobou does not sell prescription medicines. Please visit a licensed pharmacy for those.' },
      { q: 'Are health products returnable?', a: 'For hygiene reasons, opened health and personal-care items can usually only be returned if faulty.' },
      { q: 'How accurate are home monitors?', a: 'Accuracy depends on the device and correct use. Follow the instructions and share readings with your doctor.' },
    ],
  },
  {
    name: 'Pet Supplies',
    icon: 'pets',
    featured: false,
    tagline: 'Food, care and comfort for the animals you love.',
    description:
      'Keep pets healthy and happy with food, treats, grooming supplies, toys and bedding for dogs, cats, birds and more. Each listing shows the species, life stage and size it’s designed for.',
    subcategories: [
      { name: 'Dog Supplies', icon: 'pets', description: 'Food, leads, beds and toys for dogs.' },
      { name: 'Cat Supplies', icon: 'cruelty_free', description: 'Food, litter, scratchers and toys for cats.' },
      { name: 'Birds & Fish', icon: 'set_meal', description: 'Cages, aquariums, food and accessories.' },
      { name: 'Grooming & Health', icon: 'shower', description: 'Shampoos, brushes and pet care.' },
      { name: 'Livestock & Poultry', icon: 'agriculture', description: 'Feed, feeders and supplies for small farms.' },
    ],
    guide: [
      { title: 'Feed for life stage', body: 'Puppies, kittens, adults and seniors have different nutritional needs. Choose food labelled for your pet’s age and size.' },
      { title: 'Change food gradually', body: 'Mix new food with the old over about a week to avoid upsetting your pet’s stomach.' },
      { title: 'Size toys safely', body: 'Choose toys too large to swallow and replace them when they start to break apart.' },
    ],
    faqs: [
      { q: 'Do you sell veterinary medicines?', a: 'Only over-the-counter pet care is listed. For treatments, please consult a veterinarian.' },
      { q: 'Can I buy feed in bulk?', a: 'Many sellers offer large sacks and multi-pack options for livestock and poultry feed.' },
      { q: 'How do I choose the right size bed or collar?', a: 'Measure your pet and compare with the size chart on the listing.' },
    ],
  },
  {
    name: 'Baby',
    icon: 'child_care',
    featured: false,
    tagline: 'Gentle essentials for little ones and the parents who care for them.',
    description:
      'From nappies and feeding to strollers and nursery furniture, find everything for babies and toddlers. Age ranges, materials and safety standards are listed on every product.',
    subcategories: [
      { name: 'Nappies & Wipes', icon: 'baby_changing_station', description: 'Nappies, wipes and changing essentials.' },
      { name: 'Feeding', icon: 'nutrition', description: 'Bottles, breast pumps, bibs and baby food.' },
      { name: 'Strollers & Car Seats', icon: 'stroller', description: 'Prams, strollers, carriers and car seats.' },
      { name: 'Nursery', icon: 'crib', description: 'Cots, bedding, monitors and storage.' },
      { name: 'Baby Clothing', icon: 'checkroom', description: 'Bodysuits, sleepwear and outfits.' },
      { name: 'Bath & Care', icon: 'bathtub', description: 'Baby baths, gentle washes and lotions.' },
    ],
    guide: [
      { title: 'Size by weight, not age', body: 'Nappy and car-seat sizes are based on weight. Check your baby’s current weight against the chart on the listing.' },
      { title: 'Choose gentle formulas', body: 'Fragrance-free, hypoallergenic products are kindest to delicate skin.' },
      { title: 'Safety standards matter', body: 'For cots, car seats and strollers, look for the safety standard listed in the specifications.' },
    ],
    faqs: [
      { q: 'Can I return baby products?', a: 'Unopened items can usually be returned. Opened feeding and hygiene items are non-returnable unless faulty.' },
      { q: 'Are baby products BPA-free?', a: 'Feeding products list their materials. Look for “BPA-free” in the specifications.' },
      { q: 'How do I pick a car seat?', a: 'Choose by your child’s weight and height, and check it fits your vehicle. Sellers can confirm compatibility.' },
    ],
  },
  {
    name: 'Jewelry',
    icon: 'diamond',
    featured: false,
    tagline: 'Fine and fashion jewellery to mark every moment.',
    description:
      'Discover necklaces, earrings, rings, bracelets and traditional pieces in gold, silver and fashion metals. Material, purity and dimensions are listed so you know exactly what you’re buying.',
    subcategories: [
      { name: 'Necklaces & Pendants', icon: 'diamond', description: 'Chains, pendants and statement necklaces.' },
      { name: 'Earrings', icon: 'radio_button_checked', description: 'Studs, hoops and drop earrings.' },
      { name: 'Rings', icon: 'trip_origin', description: 'Engagement, wedding and fashion rings.' },
      { name: 'Bracelets & Bangles', icon: 'circle', description: 'Bangles, cuffs and charm bracelets.' },
      { name: 'Traditional Jewellery', icon: 'auto_awesome', description: 'Beads, cowries and ceremonial pieces.' },
    ],
    guide: [
      { title: 'Know the metal', body: 'Solid gold and sterling silver are marked with their purity (for example 18K or 925). Plated pieces have a thin layer over a base metal.' },
      { title: 'Find your ring size', body: 'Measure a ring you already own or use a printable sizer, then match it with the seller’s size chart.' },
      { title: 'Care for your pieces', body: 'Remove jewellery before swimming or cleaning and store pieces separately to prevent scratches.' },
    ],
    faqs: [
      { q: 'Is the gold genuine?', a: 'Sellers must state the metal and purity on the listing. Fine-jewellery sellers often provide a certificate on request.' },
      { q: 'Will plated jewellery tarnish?', a: 'Plating wears over time. Keep pieces dry and away from perfume to make them last longer.' },
      { q: 'Can rings be resized?', a: 'Some sellers offer resizing. Check the listing or message the seller before ordering.' },
    ],
  },
  {
    name: 'Watches',
    icon: 'watch',
    featured: false,
    tagline: 'Timepieces for every wrist, style and occasion.',
    description:
      'Shop classic analogue, sporty digital and smart watches for men, women and kids. Movement, water resistance and strap material are listed on every product.',
    subcategories: [
      { name: 'Men’s Watches', icon: 'watch', description: 'Dress, sports and everyday watches for men.' },
      { name: 'Women’s Watches', icon: 'watch', description: 'Elegant and everyday watches for women.' },
      { name: 'Smartwatches', icon: 'watch_screentime', description: 'Connected watches with health tracking.' },
      { name: 'Kids’ Watches', icon: 'child_care', description: 'Durable, easy-to-read watches for children.' },
      { name: 'Straps & Accessories', icon: 'link', description: 'Replacement straps, cases and winders.' },
    ],
    guide: [
      { title: 'Understand water resistance', body: '30 m means splash-proof only; 100 m or more is suitable for swimming. Never press buttons underwater unless the watch is rated for diving.' },
      { title: 'Quartz or automatic', body: 'Quartz watches are accurate and low-maintenance. Automatic watches are powered by your movement and prized for craftsmanship.' },
      { title: 'Measure your wrist', body: 'Case diameter and strap length are listed. Most adult wrists suit cases between 36 mm and 44 mm.' },
    ],
    faqs: [
      { q: 'Are watches authentic?', a: 'Branded watches must be genuine. Report any concern from your order and our team will investigate.' },
      { q: 'Is the battery included?', a: 'Quartz watches ship with a battery installed.' },
      { q: 'Can I adjust the strap?', a: 'Metal bracelets often need links removed. Many sellers include a tool or can adjust it before shipping.' },
    ],
  },
  {
    name: 'Bags',
    icon: 'shopping_bag',
    featured: false,
    tagline: 'Carry everything in style — from daily commutes to long trips.',
    description:
      'Find handbags, backpacks, travel luggage, laptop bags and wallets. Dimensions, capacity and materials are listed so you can pick the perfect fit for what you carry.',
    subcategories: [
      { name: 'Handbags', icon: 'shopping_bag', description: 'Totes, shoulder bags and clutches.' },
      { name: 'Backpacks', icon: 'backpack', description: 'School, everyday and hiking backpacks.' },
      { name: 'Travel & Luggage', icon: 'luggage', description: 'Suitcases, duffels and travel organisers.' },
      { name: 'Laptop Bags', icon: 'work', description: 'Padded bags and sleeves for laptops.' },
      { name: 'Wallets & Small Goods', icon: 'wallet', description: 'Wallets, card holders and pouches.' },
    ],
    guide: [
      { title: 'Check cabin size limits', body: 'Airlines set their own carry-on dimensions. Compare the listed bag size with your airline’s rules.' },
      { title: 'Measure your laptop', body: 'Laptop bags list the largest screen size they fit — check your laptop’s diagonal and thickness.' },
      { title: 'Choose durable materials', body: 'Leather and heavy canvas age well; nylon and polyester are lighter and often water-resistant.' },
    ],
    faqs: [
      { q: 'Is the bag real leather?', a: 'Material is listed on every product. “Genuine leather” and “PU leather” mean different things — check before ordering.' },
      { q: 'Are suitcases sold individually or as sets?', a: 'The title and variants show whether you’re buying a single case or a set.' },
      { q: 'Is the backpack waterproof?', a: 'Listings distinguish water-resistant from fully waterproof. Check the specifications.' },
    ],
  },
  {
    name: 'Office',
    icon: 'print',
    featured: false,
    tagline: 'Supplies and furniture for productive offices and classrooms.',
    description:
      'Equip your workspace with stationery, office furniture, school supplies and business essentials. Bulk options make restocking a team or classroom simple.',
    subcategories: [
      { name: 'Stationery', icon: 'edit', description: 'Pens, notebooks, paper and filing.' },
      { name: 'Office Furniture', icon: 'chair_alt', description: 'Desks, ergonomic chairs and storage.' },
      { name: 'School Supplies', icon: 'backpack', description: 'Exercise books, geometry sets and calculators.' },
      { name: 'Office Electronics', icon: 'calculate', description: 'Calculators, shredders and projectors.' },
      { name: 'Packaging & Shipping', icon: 'package_2', description: 'Boxes, tape, envelopes and labels.' },
    ],
    guide: [
      { title: 'Invest in seating', body: 'An adjustable chair with lumbar support makes long working days far more comfortable.' },
      { title: 'Buy consumables in bulk', body: 'Paper, pens and printer supplies are better value in multi-packs and reduce last-minute runs.' },
      { title: 'Check the paper size', body: 'A4 is the standard for most printers and forms. Confirm sizes when buying paper and envelopes.' },
    ],
    faqs: [
      { q: 'Do you offer business invoices?', a: 'An order receipt is available for every purchase. For VAT invoices, contact the seller from your order.' },
      { q: 'Can I order for a whole school or office?', a: 'Many sellers offer bulk quantities. Message the seller for large orders.' },
      { q: 'Is office furniture assembled?', a: 'The listing says whether assembly is required.' },
    ],
  },
  {
    name: 'Garden',
    icon: 'yard',
    featured: false,
    tagline: 'Grow, relax and enjoy the outdoors at home.',
    description:
      'Create a garden you love with plants, seeds, tools, outdoor furniture, irrigation and solar lighting. Listings include planting guidance, materials and weather resistance.',
    subcategories: [
      { name: 'Plants & Seeds', icon: 'potted_plant', description: 'Seeds, seedlings, pots and soil.' },
      { name: 'Garden Tools', icon: 'agriculture', description: 'Hoes, rakes, pruners and gloves.' },
      { name: 'Outdoor Furniture', icon: 'deck', description: 'Chairs, tables and shade for outdoor living.' },
      { name: 'Watering & Irrigation', icon: 'water_drop', description: 'Hoses, sprinklers and drip kits.' },
      { name: 'Outdoor Lighting', icon: 'solar_power', description: 'Solar lights and security lamps.' },
    ],
    guide: [
      { title: 'Plant for your climate', body: 'Choose seeds and plants suited to your rainfall and season. Planting guidance is listed on each product.' },
      { title: 'Water wisely', body: 'Drip irrigation and early-morning watering save water and keep roots healthy in hot weather.' },
      { title: 'Choose weather-proof materials', body: 'Powder-coated metal, treated wood and UV-stable plastics last longest outdoors.' },
    ],
    faqs: [
      { q: 'Are seeds suitable for my region?', a: 'Listings include climate and season guidance. Message the seller if you’re unsure.' },
      { q: 'How are live plants shipped?', a: 'Plants are packed to protect roots and leaves. Unpack and water them as soon as they arrive.' },
      { q: 'Do solar lights work in cloudy weather?', a: 'They charge more slowly on cloudy days. Place panels in direct sun for best performance.' },
    ],
  },
  {
    name: 'Tools',
    icon: 'construction',
    featured: false,
    tagline: 'Professional-grade tools for builders, makers and DIY.',
    description:
      'Get the job done with power tools, hand tools, electrical and plumbing supplies, safety equipment and measuring tools. Power ratings, voltage and included accessories are listed on every product.',
    subcategories: [
      { name: 'Power Tools', icon: 'hardware', description: 'Drills, grinders, saws and sanders.' },
      { name: 'Hand Tools', icon: 'handyman', description: 'Hammers, screwdrivers, spanners and sets.' },
      { name: 'Electrical', icon: 'electrical_services', description: 'Cables, switches, sockets and testers.' },
      { name: 'Plumbing', icon: 'plumbing', description: 'Pipes, fittings, taps and tanks.' },
      { name: 'Safety Equipment', icon: 'engineering', description: 'Helmets, goggles, gloves and boots.' },
      { name: 'Measuring & Layout', icon: 'straighten', description: 'Tapes, levels and laser measures.' },
    ],
    guide: [
      { title: 'Corded or cordless', body: 'Cordless tools offer freedom on site; corded tools give constant power for long jobs. Battery platforms are often shared across a brand’s range.' },
      { title: 'Check what’s in the box', body: 'Some power tools are sold “tool only” without battery or charger. The listing makes this clear.' },
      { title: 'Always wear protection', body: 'Use eye protection, gloves and hearing protection with power tools, and follow the manufacturer’s guidance.' },
    ],
    faqs: [
      { q: 'Are batteries included with cordless tools?', a: 'The title or “In the box” section states whether batteries and a charger are included.' },
      { q: 'Do you sell building materials?', a: 'Selected sellers list cement, paint and other materials. Delivery options for heavy items are shown at checkout.' },
      { q: 'Is there a warranty on power tools?', a: 'Warranty details are listed on each product page.' },
    ],
  },
  {
    name: 'Arts & Crafts',
    icon: 'brush',
    featured: false,
    tagline: 'Materials to make, paint, sew and create.',
    description:
      'Bring ideas to life with paints, drawing supplies, sewing and fabric, beading kits and craft tools. Find supplies for hobbyists, students and professional artisans alike.',
    subcategories: [
      { name: 'Painting & Drawing', icon: 'palette', description: 'Paints, brushes, canvases and sketchbooks.' },
      { name: 'Sewing & Fabric', icon: 'content_cut', description: 'Fabric, thread, sewing machines and notions.' },
      { name: 'Beading & Jewellery Making', icon: 'auto_awesome', description: 'Beads, wire, clasps and kits.' },
      { name: 'Craft Supplies', icon: 'draw', description: 'Glue, paper, card and decorations.' },
      { name: 'Kids’ Crafts', icon: 'child_care', description: 'Safe, mess-friendly craft kits for children.' },
    ],
    guide: [
      { title: 'Pick the right paint', body: 'Acrylics dry fast and clean up with water; oils blend slowly for rich detail; watercolours are light and portable.' },
      { title: 'Match fabric to project', body: 'Cotton wax prints are ideal for clothing; heavier fabrics suit bags and upholstery. Listings show width and weight.' },
      { title: 'Choose non-toxic for kids', body: 'Look for non-toxic, washable materials for young crafters.' },
    ],
    faqs: [
      { q: 'How is fabric sold?', a: 'Fabric is sold by the yard, metre or full piece — the listing states which.' },
      { q: 'Do you sell handmade art?', a: 'Yes, artisans list original work and prints. Each listing describes the medium and size.' },
      { q: 'Can I request bulk craft supplies?', a: 'Many sellers offer quantity options for schools and workshops.' },
    ],
  },
  {
    name: 'Musical Instruments',
    icon: 'music_note',
    featured: false,
    tagline: 'Instruments and studio gear for every musician.',
    description:
      'Play, record and perform with guitars, keyboards, traditional percussion, studio equipment and accessories. Beginner bundles and professional gear sit side by side.',
    subcategories: [
      { name: 'Guitars & Bass', icon: 'music_note', description: 'Acoustic, electric and bass guitars.' },
      { name: 'Keyboards & Pianos', icon: 'piano', description: 'Digital pianos and keyboards.' },
      { name: 'Drums & Percussion', icon: 'album', description: 'Drum kits, djembes and talking drums.' },
      { name: 'Studio & Recording', icon: 'mic', description: 'Microphones, interfaces and monitors.' },
      { name: 'Instrument Accessories', icon: 'tune', description: 'Strings, stands, cases and tuners.' },
    ],
    guide: [
      { title: 'Start with a bundle', body: 'Beginner bundles include essentials like a case, tuner and strap, so you can start playing straight away.' },
      { title: 'Weighted keys for pianists', body: 'If you’re learning piano, choose a keyboard with weighted or semi-weighted keys for a realistic touch.' },
      { title: 'Protect your instrument', body: 'Humidity and heat affect wooden instruments. Store them in a case away from direct sunlight.' },
    ],
    faqs: [
      { q: 'Do instruments arrive tuned?', a: 'Instruments are set up by the seller but may need tuning after transport. A tuner is a worthwhile first accessory.' },
      { q: 'Do you sell traditional instruments?', a: 'Yes — djembes, talking drums, koras and more are listed by local makers.' },
      { q: 'Are cables included with electric instruments?', a: 'The “In the box” section lists included cables and power supplies.' },
    ],
  },
];

const CATEGORY_NAMES = CATEGORY_CATALOG.map((c) => c.name);

module.exports = { CATEGORY_CATALOG, CATEGORY_NAMES };
