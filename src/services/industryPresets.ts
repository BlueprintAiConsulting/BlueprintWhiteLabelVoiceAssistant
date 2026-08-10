import { CallType, Settings } from "../types.ts";

export type IndustryType = 'hvac' | 'roofing_siding' | 'plumbing' | 'electrical' | 'tree_service' | 'general_contracting';

export interface IndustryDefinition {
  id: IndustryType;
  name: string;
  shortName: string;
  tagline: string;
  iconName: string;
  defaultOfficeName: string;
  defaultReceptionistName: string;
  defaultOwnerName: string;
  defaultOwnerTitle: string;
  defaultOwnerPhone: string;
  emergencyKeywords: string[];
  equipmentTypes: string[];
  callTypes: { key: CallType; label: string; description: string }[];
  tier1LifeSafetyInstructions: string;
  tier2EmergencyGuidance: string;
  prohibitedClaims: string[];
  pricingDefaults: {
    serviceCall: string;
    afterHours: string;
    maintenancePlanName: string;
    maintenancePlanPrice: string;
    maintenancePlanBenefits: string;
  };
  customFaqs: { id: string; question: string; answer: string }[];
  quickScenarios: {
    id: string;
    icon: string;
    title: string;
    badge: string;
    prompt: string;
    description: string;
  }[];
  seedLeads: any[];
}

export const INDUSTRY_PRESETS: Record<IndustryType, IndustryDefinition> = {
  hvac: {
    id: 'hvac',
    name: 'HVAC & Climate Control',
    shortName: 'HVAC',
    tagline: 'Heating, Air Conditioning & Indoor Air Quality Specialists',
    iconName: 'Wind',
    defaultOfficeName: 'Lunar Heating and Cooling',
    defaultReceptionistName: 'Megan',
    defaultOwnerName: 'Josh',
    defaultOwnerTitle: 'Master HVAC Technician & Owner',
    defaultOwnerPhone: '+17175770668',
    emergencyKeywords: ['gas leak', 'carbon monoxide', 'no heat', 'sparks', 'smoke', 'flooding'],
    equipmentTypes: ['Furnace', 'Air Conditioning', 'Heat Pump', 'Boiler', 'Mini-Split', 'Thermostat', 'Ductwork'],
    callTypes: [
      { key: 'estimate_request', label: 'System Replacement Quote', description: 'Request for new AC/furnace installation' },
      { key: 'repair_request', label: 'Service Repair', description: 'Equipment malfunction or breakdown' },
      { key: 'maintenance_request', label: 'Tune-Up / Maintenance', description: 'Seasonal inspection & maintenance plan' },
      { key: 'emergency', label: 'Emergency Service', description: 'No heat in freezing weather or safety risk' },
      { key: 'existing_customer', label: 'Existing Customer', description: 'Follow-up or warranty inquiry' },
      { key: 'general_office', label: 'General Office', description: 'Billing, vendor, or general question' },
      { key: 'spam', label: 'Spam / Telemarketer', description: 'Unsolicited call' }
    ],
    tier1LifeSafetyInstructions: 'LIFE SAFETY ALERT: Instruct caller to immediately leave the building and call 911 or the gas company (for gas odors, CO alarms, or electrical sparks) before taking details.',
    tier2EmergencyGuidance: 'Treat no-heat in freezing conditions or total AC loss in extreme heatwaves as priority emergency dispatch to the on-call technician.',
    prohibitedClaims: [
      'Quoting exact repair prices by phone without inspection',
      'Guaranteeing exact arrival times by phone',
      'Diagnosing internal electrical/gas faults without an in-person technician inspection',
      'Instructing callers to open gas valves, electrical breakers, or furnace access panels'
    ],
    pricingDefaults: {
      serviceCall: '$89 Standard Diagnostic Service Call',
      afterHours: '$149 After-Hours / Weekend Emergency Diagnostic',
      maintenancePlanName: 'Comfort Club Protection Plan',
      maintenancePlanPrice: '$19/mo or $199/yr',
      maintenancePlanBenefits: 'Includes 2 precision tune-ups per year (Spring AC & Fall Furnace), 15% discount on all repairs, priority VIP scheduling, and zero emergency trip fees.'
    },
    customFaqs: [
      { id: 'f1', question: 'How much is a diagnostic service call?', answer: 'Our standard diagnostic fee is $89. A licensed technician thoroughly inspects your system and provides an upfront, exact quote before any work begins.' },
      { id: 'f2', question: 'Do you offer free estimates on new systems?', answer: 'Yes! We provide 100% free, no-obligation in-home estimates for complete furnace, AC, heat pump, or mini-split replacements.' },
      { id: 'f3', question: 'What is included in your Comfort Club maintenance plan?', answer: 'Our Comfort Club ($19/mo) includes 2 annual precision tune-ups, 15% off all repairs, priority scheduling, and waived after-hours dispatch fees.' }
    ],
    quickScenarios: [
      {
        id: 'hvac_no_heat',
        icon: 'Flame',
        title: 'Freezing Weather No-Heat',
        badge: 'Priority Emergency',
        prompt: "Hello! My furnace stopped blowing heat an hour ago and it's 20 degrees outside. My house is dropping to 55. Can someone come out today?",
        description: 'Tests no-heat emergency triage, address/callback intake, and emergency dispatch offer.'
      },
      {
        id: 'hvac_ac_quote',
        icon: 'Snowflake',
        title: 'New AC Replacement Quote',
        badge: 'High Value Lead',
        prompt: "Hi, my central AC unit is 18 years old and struggling. I'd like to get an estimate on replacing it with a high-efficiency system next week.",
        description: 'Tests equipment intake, free estimate scheduling, and Google Calendar slot booking.'
      },
      {
        id: 'hvac_owner_transfer',
        icon: 'PhoneForwarded',
        title: 'Transfer to Owner (Josh)',
        badge: 'Direct Transfer',
        prompt: "Hey Megan, this is Dave from York Supply. Is Josh around? I have his order confirmation.",
        description: 'Tests direct warm call transfer to Josh without intake interrogation.'
      }
    ],
    seedLeads: [
      {
        caller_name: 'Robert Vance',
        callback_number: '+1 (717) 555-0192',
        reason_for_call: 'Furnace making loud squealing noise and blowing lukewarm air in master bedroom.',
        call_type: 'repair_request',
        emergency_flag: false,
        property_address: '1428 Elmwood Drive, York, PA 17403',
        equipment_type: 'Gas Furnace',
        issue_description: 'Squealing blower belt / motor bearing warning.',
        call_status: 'new'
      }
    ]
  },

  roofing_siding: {
    id: 'roofing_siding',
    name: 'Roofing & Siding',
    shortName: 'Roofing & Siding',
    tagline: 'Premier Roof Replacement, Storm Damage & Siding Contractors',
    iconName: 'Home',
    defaultOfficeName: 'Apex Roofing & Siding',
    defaultReceptionistName: 'Megan',
    defaultOwnerName: 'Josh',
    defaultOwnerTitle: 'Lead Estimator & Owner',
    defaultOwnerPhone: '+17175770668',
    emergencyKeywords: ['active leak', 'water pouring', 'roof collapse', 'tree on roof', 'downed line', 'emergency tarp', 'ceiling sagging'],
    equipmentTypes: ['Architectural Shingle', 'Metal Roof', 'Flat EPDM Rubber', 'Tile', 'Slate', 'Vinyl Siding', 'Fiber Cement / Hardie', 'Seamless Gutters'],
    callTypes: [
      { key: 'roof_replacement_estimate', label: 'Roof Replacement Quote', description: 'Full tear-off or new roof estimate' },
      { key: 'siding_estimate', label: 'Siding Replacement Quote', description: 'Vinyl, Hardie, or board & batten quote' },
      { key: 'roof_repair', label: 'Roof Repair', description: 'Shingle repair, pipe boot, or flashing leak' },
      { key: 'storm_hail_damage', label: 'Storm / Hail Inspection', description: 'Insurance storm damage assessment' },
      { key: 'gutter_soffit_repair', label: 'Gutters & Fascia', description: 'Seamless gutters, downspouts, soffit' },
      { key: 'emergency_tarping', label: 'Emergency Tarping', description: 'Active leak requiring immediate roof tarping' },
      { key: 'general_office', label: 'General Office', description: 'Billing, vendor, or general question' },
      { key: 'spam', label: 'Spam / Telemarketer', description: 'Unsolicited call' }
    ],
    tier1LifeSafetyInstructions: 'LIFE SAFETY ALERT: Instruct caller to immediately leave the building if structural roof collapse or downed electrical lines are present. Call 911 or electric utility before taking details.',
    tier2EmergencyGuidance: 'Active interior ceiling leaks pouring during heavy rain or tree damage requiring immediate tarping should be collected (address + callback) and dispatched to the on-call tarp crew.',
    prohibitedClaims: [
      'Quoting exact per-square-foot roof replacement prices by phone without satellite/in-person measurement',
      'Guaranteeing 100% insurance claim approval by phone',
      'Instructing homeowners to climb onto wet or steep roofs to inspect damage themselves',
      'Promising exact completion dates before permit approval and crew scheduling'
    ],
    pricingDefaults: {
      serviceCall: '$99 Roof Leak Diagnostic & Inspection',
      afterHours: '$249 Emergency Roof Tarping Dispatch',
      maintenancePlanName: 'RoofGuard Annual Maintenance & Inspection',
      maintenancePlanPrice: '$299/year',
      maintenancePlanBenefits: 'Annual 21-point roof inspection, gutter cleaning, resealing pipe boots/flashing, emergency priority tarping, and 10% discount on future repairs.'
    },
    customFaqs: [
      { id: 'rf1', question: 'Do you offer free estimates for roof replacements?', answer: 'Yes! We offer 100% free, comprehensive in-person roof replacement and siding estimates with satellite 3D roof reports.' },
      { id: 'rf2', question: 'Do you assist with storm & hail damage insurance claims?', answer: 'Absoluty. We inspect your roof for hail or wind damage, document all evidence for your adjuster, and walk you through the insurance claim process.' },
      { id: 'rf3', question: 'How quickly can you tarp an active roof leak?', answer: 'We offer 24/7 emergency tarping services. During active storms, our emergency response crew arrives promptly to secure your roof and prevent interior water damage.' }
    ],
    quickScenarios: [
      {
        id: 'roof_leak_storm',
        icon: 'CloudRain',
        title: 'Active Roof Leak (Rain Storm)',
        badge: 'Emergency Tarping',
        prompt: "Help! Water is dripping through my living room ceiling right now during this heavy rain storm. I think shingles blew off!",
        description: 'Tests active leak emergency triage, immediate address/callback capture, and tarping dispatch.'
      },
      {
        id: 'roof_replacement_quote',
        icon: 'Home',
        title: 'Full Roof Replacement Quote',
        badge: 'High Value ($15k+)',
        prompt: "Hi Megan, our architectural shingle roof is 22 years old and showing granule loss. We want a quote for a full tear-off and replacement.",
        description: 'Tests roof material intake, number of stories, and free estimate booking on calendar.'
      },
      {
        id: 'siding_hardie_quote',
        icon: 'Layers',
        title: 'Hardie Board Siding Quote',
        badge: 'Siding Lead',
        prompt: "Hello, we are remodeling our home exterior and want an estimate for James Hardie fiber cement siding installation.",
        description: 'Tests siding material intake, property details, and scheduling an estimator visit.'
      }
    ],
    seedLeads: [
      {
        caller_name: 'Sarah Jenkins',
        callback_number: '+1 (717) 555-0811',
        reason_for_call: 'Active ceiling leak in upstairs hallway following last night hail storm.',
        call_type: 'emergency_tarping',
        emergency_flag: true,
        property_address: '842 Highland Ave, Hanover, PA 17331',
        equipment_type: 'Architectural Shingle',
        issue_description: 'Wind-blown shingles & interior water stain. Needs emergency tarping.',
        call_status: 'emergency_follow_up'
      }
    ]
  },

  plumbing: {
    id: 'plumbing',
    name: 'Plumbing & Drain Cleaning',
    shortName: 'Plumbing',
    tagline: '24/7 Emergency Plumbing, Drain Clearing & Tankless Water Heaters',
    iconName: 'Droplets',
    defaultOfficeName: 'FlowMaster Plumbing & Drains',
    defaultReceptionistName: 'Megan',
    defaultOwnerName: 'Josh',
    defaultOwnerTitle: 'Master Plumber & Owner',
    defaultOwnerPhone: '+17175770668',
    emergencyKeywords: ['burst pipe', 'sewer backup', 'main leak', 'water pouring', 'gas line', 'no water', 'overflowing toilet'],
    equipmentTypes: ['Tankless Water Heater', 'Tank Water Heater', 'Main Water Line', 'Sewer Main', 'Sump Pump', 'Garbage Disposal', 'Faucets & Fixtures', 'PEX / Copper Piping'],
    callTypes: [
      { key: 'plumbing_repair', label: 'General Repair', description: 'Leak, faucet, toilet, or pipe repair' },
      { key: 'water_heater_estimate', label: 'Water Heater Replacement', description: 'Tank or tankless water heater quote' },
      { key: 'drain_clearing', label: 'Drain Clearing', description: 'Clogged sink, shower, or main line' },
      { key: 'sewer_backup_emergency', label: 'Sewer Backup Emergency', description: 'Raw sewage backup or main drain clog' },
      { key: 'repipe_estimate', label: 'Whole-Home Repipe', description: 'PEX or copper whole-house repiping quote' },
      { key: 'general_office', label: 'General Office', description: 'Billing, vendor, or general question' },
      { key: 'spam', label: 'Spam / Telemarketer', description: 'Unsolicited call' }
    ],
    tier1LifeSafetyInstructions: 'LIFE SAFETY ALERT: If gas line smell is present near water heater or electrical panels are flooded, instruct caller to evacuate and call 911 or gas utility immediately.',
    tier2EmergencyGuidance: 'Burst pipes or main sewer backups: instruct caller where the main water shutoff valve is located to stop flooding, collect address + callback, and dispatch emergency plumber immediately.',
    prohibitedClaims: [
      'Guaranteeing drain clearing without camera inspection if roots or collapsed pipes are suspected',
      'Quoting exact re-pipe costs without inspecting crawlspace or basement piping access',
      'Instructing callers to pour harsh chemical drain openers into completely blocked main lines'
    ],
    pricingDefaults: {
      serviceCall: '$79 Diagnostic Service Fee',
      afterHours: '$149 After-Hours Emergency Dispatch',
      maintenancePlanName: 'FlowShield Protection Plan',
      maintenancePlanPrice: '$15/mo or $149/yr',
      maintenancePlanBenefits: 'Annual whole-home plumbing inspection, water heater flush, free camera drain inspection once per year, and 15% discount on all repairs.'
    },
    customFaqs: [
      { id: 'p1', question: 'How much is your diagnostic fee?', answer: 'Our standard diagnostic inspection is $79. Our plumber inspects the leak or clog and provides an upfront flat-rate price before starting any work.' },
      { id: 'p2', question: 'Where is my main water shutoff valve?', answer: 'In most homes, the main shutoff valve is located in the basement near the front wall, near the water meter, or inside the water heater closet. Turn it clockwise to stop incoming water.' },
      { id: 'p3', question: 'Should I upgrade to a tankless water heater?', answer: 'Tankless water heaters provide endless hot water, use up to 34% less energy, and last 20+ years. We offer free in-home estimates to see if your gas/electric line supports tankless.' }
    ],
    quickScenarios: [
      {
        id: 'plumb_burst_pipe',
        icon: 'Droplets',
        title: 'Burst Pipe Flooding Basement',
        badge: 'Priority Emergency',
        prompt: "Help! A pipe under my kitchen floor burst and water is pouring into the basement! What do I do?",
        description: 'Tests main water shutoff guidance, emergency callback/address intake, and immediate plumber dispatch.'
      },
      {
        id: 'plumb_tankless_quote',
        icon: 'Flame',
        title: 'Tankless Water Heater Quote',
        badge: 'Replacement Lead',
        prompt: "Hi, our 50-gallon water heater is leaking from the bottom. We'd like to get a quote to upgrade to a Rinnai tankless system.",
        description: 'Tests water heater options intake, free estimate scheduling, and calendar slot booking.'
      }
    ],
    seedLeads: [
      {
        caller_name: 'David Miller',
        callback_number: '+1 (717) 555-0344',
        reason_for_call: '50-gallon water heater leaking around base in basement. No hot water.',
        call_type: 'water_heater_estimate',
        emergency_flag: false,
        property_address: '304 Oak Street, York, PA 17402',
        equipment_type: 'Tank Water Heater',
        issue_description: 'Tank leaking from bottom seam. Wants quote for replacement.',
        call_status: 'new'
      }
    ]
  },

  electrical: {
    id: 'electrical',
    name: 'Electrical Services',
    shortName: 'Electrical',
    tagline: 'Licensed Electrical Contractors, Panel Upgrades & EV Chargers',
    iconName: 'Zap',
    defaultOfficeName: 'Current Tech Electrical',
    defaultReceptionistName: 'Megan',
    defaultOwnerName: 'Josh',
    defaultOwnerTitle: 'Master Electrician & Owner',
    defaultOwnerPhone: '+17175770668',
    emergencyKeywords: ['sparks', 'burning smell', 'smoke from outlet', 'breaker keeps tripping', 'power outage', 'shock', 'exposed wire'],
    equipmentTypes: ['Main Breaker Panel (100A/200A/400A)', 'EV Level 2 Charger', 'Whole-House Generator', 'Outlets & GFCI', 'Recessed Lighting', 'Subpanel', 'Aluminum Wiring'],
    callTypes: [
      { key: 'electrical_repair', label: 'Electrical Repair', description: 'Dead outlets, tripping breaker, or fixture issue' },
      { key: 'panel_upgrade_estimate', label: 'Panel Upgrade Quote', description: '100A to 200A panel upgrade or subpanel' },
      { key: 'ev_charger_install', label: 'EV Charger Installation', description: 'Level 2 electric vehicle charger installation' },
      { key: 'generator_estimate', label: 'Whole-House Generator', description: 'Generac whole-home standby generator estimate' },
      { key: 'lighting_install', label: 'Lighting & Ceiling Fans', description: 'Recessed lights, fans, exterior lighting' },
      { key: 'electrical_emergency', label: 'Electrical Emergency', description: 'Sparks, burning smell, or dangerous outage' },
      { key: 'general_office', label: 'General Office', description: 'Billing, vendor, or general question' },
      { key: 'spam', label: 'Spam / Telemarketer', description: 'Unsolicited call' }
    ],
    tier1LifeSafetyInstructions: 'LIFE SAFETY ALERT: If active smoke, fire, or continuous sparks are coming from an outlet or panel, instruct caller to evacuate and call 911 immediately. Do NOT touch electrical panels.',
    tier2EmergencyGuidance: 'Total power loss to home when neighbors have power or main breaker buzzing loudly: collect address + callback and dispatch emergency electrician.',
    prohibitedClaims: [
      'Instructing homeowners to remove breaker panel covers or handle live wires',
      'Quoting exact panel upgrade costs without inspecting existing service entrance & grounding',
      'Guaranteeing utility power company hookup dates'
    ],
    pricingDefaults: {
      serviceCall: '$89 Diagnostic Electrical Inspection',
      afterHours: '$169 After-Hours Emergency Dispatch',
      maintenancePlanName: 'CurrentSafe Electrical Protection',
      maintenancePlanPrice: '$15/mo or $149/yr',
      maintenancePlanBenefits: 'Annual 30-point electrical safety check, thermal infrared panel inspection, surge protector testing, and 15% discount on all installations.'
    },
    customFaqs: [
      { id: 'e1', question: 'How much does a 200-Amp panel upgrade cost?', answer: 'Most residential 200-Amp panel upgrades range between $2,200 and $3,800 depending on utility service feed, meter socket, and grounding requirements. We provide free in-person estimates.' },
      { id: 'e2', question: 'Can you install a Tesla / EV Level 2 charger at my home?', answer: 'Yes! We install dedicated 240V 50-Amp NEMA 14-50 outlets and hardwired EV chargers (Tesla Wall Connector, ChargePoint, JuiceBox) with complete local permitting.' },
      { id: 'e3', question: 'Why does my breaker keep tripping?', answer: 'Breakers trip due to overloaded circuits, short circuits, or ground faults. If a breaker trips repeatedly, leave it OFF and let an electrician inspect the line to prevent fire hazards.' }
    ],
    quickScenarios: [
      {
        id: 'elec_sparks_outlet',
        icon: 'Zap',
        title: 'Sparks & Burning Smell at Outlet',
        badge: 'Priority Emergency',
        prompt: "Help, my kitchen outlet just sparked and made a pop sound, and now there is a burning plastic smell!",
        description: 'Tests electrical safety warning, immediate callback/address capture, and emergency electrician dispatch.'
      },
      {
        id: 'elec_panel_quote',
        icon: 'Cpu',
        title: '200A Panel Upgrade Quote',
        badge: 'Upgrade Lead',
        prompt: "Hi Megan, we are installing a hot tub and an EV charger and need to upgrade our old 100-amp electrical panel to 200 amps.",
        description: 'Tests panel details intake, free estimate scheduling, and calendar slot booking.'
      }
    ],
    seedLeads: [
      {
        caller_name: 'Mark Taylor',
        callback_number: '+1 (717) 555-0922',
        reason_for_call: 'Wants to install Tesla Wall Connector in garage and upgrade main breaker panel.',
        call_type: 'panel_upgrade_estimate',
        emergency_flag: false,
        property_address: '512 Pine Street, Lancaster, PA 17601',
        equipment_type: 'Main Breaker Panel (100A/200A/400A)',
        issue_description: '100A panel is full. Needs 200A upgrade for EV charger.',
        call_status: 'new'
      }
    ]
  },

  tree_service: {
    id: 'tree_service',
    name: 'Tree Service & Landscaping',
    shortName: 'Tree & Landscape',
    tagline: 'Hazardous Tree Removal, Storm Emergency Arborists & Hardscaping',
    iconName: 'Trees',
    defaultOfficeName: 'TimberCare Tree & Landscape',
    defaultReceptionistName: 'Megan',
    defaultOwnerName: 'Josh',
    defaultOwnerTitle: 'Certified Arborist & Owner',
    defaultOwnerPhone: '+17175770668',
    emergencyKeywords: ['tree on house', 'tree on car', 'hanging branch', 'downed tree', 'blocked driveway', 'power line branch'],
    equipmentTypes: ['Large Tree Removal', 'Crane Tree Removal', 'Hazardous Limb Trimming', 'Stump Grinding', 'Retaining Walls', 'Paver Patio', 'Storm Clearing'],
    callTypes: [
      { key: 'tree_removal_estimate', label: 'Tree Removal Quote', description: 'Removal of hazardous, dead, or unwanted trees' },
      { key: 'tree_trimming', label: 'Tree Trimming / Pruning', description: 'Limb trimming, canopy thinning, crown reduction' },
      { key: 'storm_emergency_tree', label: 'Storm Emergency Tree', description: 'Fallen tree on structure, car, or driveway' },
      { key: 'stump_grinding', label: 'Stump Grinding', description: 'Stump removal & deep grinding' },
      { key: 'landscaping_estimate', label: 'Landscaping & Hardscaping', description: 'Paver patios, retaining walls, planting' },
      { key: 'general_office', label: 'General Office', description: 'Billing, vendor, or general question' },
      { key: 'spam', label: 'Spam / Telemarketer', description: 'Unsolicited call' }
    ],
    tier1LifeSafetyInstructions: 'LIFE SAFETY ALERT: If a fallen tree limb is contacting power lines or someone is trapped, instruct caller to stay 30 feet away and call 911 / electric utility immediately.',
    tier2EmergencyGuidance: 'Fallen trees blocking driveways or resting on roofs after a storm: collect address + callback immediately and dispatch our emergency crane/tree crew.',
    prohibitedClaims: [
      'Quoting tree removal costs by phone without inspecting tree height, proximity to power lines/structures, and crane access',
      'Promising tree removal on utility power lines without power company line-clearance coordination',
      'Guaranteeing exact stump grinding depth over underground gas/electric utilities without 811 markout'
    ],
    pricingDefaults: {
      serviceCall: '$0 Free In-Person Tree Removal Estimate',
      afterHours: '$299 Emergency Storm Tree Dispatch & Crane Setup',
      maintenancePlanName: 'Property Tree Preservation Plan',
      maintenancePlanPrice: '$399/year',
      maintenancePlanBenefits: 'Bi-annual Certified Arborist health inspection, priority storm emergency response, free deep root fertilization, and 15% discount on all trimming/removal.'
    },
    customFaqs: [
      { id: 't1', question: 'Do you offer free estimates for tree removal?', answer: 'Yes! We provide 100% free, no-obligation on-site estimates by a Certified Arborist.' },
      { id: 't2', question: 'Does insurance cover a tree that fell on my house?', answer: 'In most cases, homeowner insurance covers tree removal and structural repairs if a tree falls on your house, garage, or driveway due to a storm. We document the damage for your adjuster.' },
      { id: 't3', question: 'Do you grind the stump after removing a tree?', answer: 'Yes, we offer complete stump grinding services down to 8–12 inches below ground level, including woodchip cleanup and topsoil fill.' }
    ],
    quickScenarios: [
      {
        id: 'tree_storm_house',
        icon: 'Trees',
        title: 'Storm Tree Fallen on Roof',
        badge: 'Priority Emergency',
        prompt: "Help! High storm winds just blew a large oak tree limb onto my garage roof and it cracked the rafters!",
        description: 'Tests storm emergency triage, address/callback capture, and emergency arborist crane dispatch.'
      },
      {
        id: 'tree_removal_quote',
        icon: 'Axe',
        title: 'Large Pine Tree Removal Quote',
        badge: 'Tree Lead',
        prompt: "Hi Megan, I have a dead 60-foot pine tree in my backyard near the power lines that needs to come down before winter.",
        description: 'Tests tree location/size intake, arborist visit scheduling, and calendar slot booking.'
      }
    ],
    seedLeads: [
      {
        caller_name: 'James Wilson',
        callback_number: '+1 (717) 555-0722',
        reason_for_call: 'Dead oak tree leaning dangerously near garage.',
        call_type: 'tree_removal_estimate',
        emergency_flag: false,
        property_address: '915 Ridge Road, Gettysburg, PA 17325',
        equipment_type: 'Large Tree Removal',
        issue_description: '60ft Oak tree near structure. Needs estimate.',
        call_status: 'new'
      }
    ]
  },

  general_contracting: {
    id: 'general_contracting',
    name: 'General Contracting & Remodeling',
    shortName: 'Contracting',
    tagline: 'Design-Build Custom Remodeling, Additions & Renovations',
    iconName: 'Hammer',
    defaultOfficeName: 'Blueprint Design & Build',
    defaultReceptionistName: 'Megan',
    defaultOwnerName: 'Josh',
    defaultOwnerTitle: 'General Contractor & Owner',
    defaultOwnerPhone: '+17175770668',
    emergencyKeywords: ['structural damage', 'collapsed wall', 'water intrusion', 'storm damage', 'unsecured site'],
    equipmentTypes: ['Kitchen Remodel', 'Bathroom Remodel', 'Master Suite Addition', 'Basement Finishing', 'Custom Deck', 'Exterior Siding/Structural', 'Whole-House Renovation'],
    callTypes: [
      { key: 'kitchen_remodel_estimate', label: 'Kitchen Remodel Quote', description: 'Custom kitchen renovation or redesign' },
      { key: 'bathroom_remodel_estimate', label: 'Bathroom Remodel Quote', description: 'Master bath or hall bath remodeling' },
      { key: 'home_addition_estimate', label: 'Home Addition / Bump-Out', description: 'In-law suite, room addition, or 2nd story' },
      { key: 'deck_patio_quote', label: 'Custom Deck / Porch', description: 'Composite deck, covered porch, or patio' },
      { key: 'general_repair', label: 'General Structural Repair', description: 'Structural framing, dryrot, or site repair' },
      { key: 'site_board_up_emergency', label: 'Emergency Site Securing', description: 'Post-storm or fire board-up and containment' },
      { key: 'general_office', label: 'General Office', description: 'Billing, vendor, or general question' },
      { key: 'spam', label: 'Spam / Telemarketer', description: 'Unsolicited call' }
    ],
    tier1LifeSafetyInstructions: 'LIFE SAFETY ALERT: If load-bearing structural collapse or wall failure is active, instruct caller to evacuate immediately and call 911 before taking details.',
    tier2EmergencyGuidance: 'Major storm structural breach or broken exterior envelope: collect address + callback and dispatch emergency site containment/board-up crew.',
    prohibitedClaims: [
      'Quoting exact remodeling prices by phone without architectural drawings or on-site inspection',
      'Guaranteeing exact project start dates before architectural plans and municipal building permits are approved',
      'Promising sub-contractor availability without project schedule approval'
    ],
    pricingDefaults: {
      serviceCall: '$0 Free Initial Design Consultation',
      afterHours: '$199 Emergency Board-Up & Site Securing Dispatch',
      maintenancePlanName: 'Home Care Annual Structural Audit',
      maintenancePlanPrice: '$499/year',
      maintenancePlanBenefits: 'Annual comprehensive home exterior/interior audit, thermal leak imaging, roof/deck framing inspection, and priority scheduling on all renovations.'
    },
    customFaqs: [
      { id: 'gc1', question: 'How does your remodeling design-build process work?', answer: 'We start with a free in-home consultation to discuss your vision and budget. Next, we provide 3D architectural renders, line-item pricing, manage all township permits, and execute construction with our dedicated craftsmen.' },
      { id: 'gc2', question: 'Do you pull all necessary building permits?', answer: 'Yes! We handle 100% of municipal building, electrical, plumbing, and mechanical permits and coordinate all township inspections.' },
      { id: 'gc3', question: 'How long does a typical kitchen or bathroom remodel take?', answer: 'A hall bathroom remodel typically takes 2–3 weeks; a full custom kitchen takes 4–6 weeks once materials arrive.' }
    ],
    quickScenarios: [
      {
        id: 'gc_kitchen_quote',
        icon: 'Utensils',
        title: 'Custom Kitchen Remodel Quote',
        badge: 'High Value ($40k+)',
        prompt: "Hi Megan, we want to remodel our 1990s kitchen, open up the wall to the dining room, and install custom quartz countertops.",
        description: 'Tests remodeling vision intake, project timeline, and free consultation booking.'
      },
      {
        id: 'gc_addition_quote',
        icon: 'Maximize2',
        title: 'In-Law Suite Addition Quote',
        badge: 'Addition Lead ($80k+)',
        prompt: "Hello, we are planning a 500-square-foot first-floor in-law suite addition on the side of our home and need an estimator.",
        description: 'Tests addition scope intake, property details, and scheduling a general contractor visit.'
      }
    ],
    seedLeads: [
      {
        caller_name: 'David & Karen Miller',
        callback_number: '+1 (717) 555-0488',
        reason_for_call: 'Wants full kitchen remodel with custom cabinets and island.',
        call_type: 'kitchen_remodel_estimate',
        emergency_flag: false,
        property_address: '1104 Fairview Drive, Red Lion, PA 17356',
        equipment_type: 'Kitchen Remodel',
        issue_description: 'Complete kitchen tear-out and open-concept layout.',
        call_status: 'new'
      }
    ]
  }
};

/**
 * Returns complete Settings populated with default presets for the chosen industry.
 */
export function getSettingsForIndustry(industry: IndustryType, existingSettings?: Settings): Settings {
  const preset = INDUSTRY_PRESETS[industry] || INDUSTRY_PRESETS.hvac;

  const base: Settings = existingSettings || {
    office_name: preset.defaultOfficeName,
    receptionist_name: preset.defaultReceptionistName,
    business_hours: { start: "09:00", end: "17:00", days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] },
    timezone: "America/New_York",
    service_areas: ["York", "Hanover", "Lancaster", "Gettysburg", "Red Lion", "Dallastown", "South Central PA"],
    primary_zip_code: "17401",
    service_radius_miles: 25,
    service_zip_codes: ["17401", "17402", "17403", "17404", "17406", "17408", "17331", "17327", "17315", "17356", "17601", "17325"],
    transfer_enabled: true,
    transfer_phone_number: preset.defaultOwnerPhone,
    on_call_technician_phone: preset.defaultOwnerPhone,
    after_hours_message: `Thank you for calling ${preset.defaultOfficeName}. Our office is currently closed.`,
    emergency_keywords: preset.emergencyKeywords,
    receptionist_voice: "Aoede",
    receptionist_voice_style: "warm, concise, natural office receptionist",
    prompt_overrides: ""
  };

  return {
    ...base,
    industry: industry,
    office_name: existingSettings?.office_name || preset.defaultOfficeName,
    owner_name: existingSettings?.owner_name || preset.defaultOwnerName,
    owner_title: existingSettings?.owner_title || preset.defaultOwnerTitle,
    owner_phone_number: existingSettings?.owner_phone_number || preset.defaultOwnerPhone,
    emergency_keywords: preset.emergencyKeywords,
    pricing_service_call: preset.pricingDefaults.serviceCall,
    pricing_after_hours: preset.pricingDefaults.afterHours,
    maintenance_plan_name: preset.pricingDefaults.maintenancePlanName,
    maintenance_plan_price: preset.pricingDefaults.maintenancePlanPrice,
    maintenance_plan_benefits: preset.pricingDefaults.maintenancePlanBenefits,
    custom_faqs: preset.customFaqs
  };
}
