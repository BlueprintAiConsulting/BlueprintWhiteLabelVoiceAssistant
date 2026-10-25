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
  domainKnowledge?: string[];
  objectionHandling?: { trigger: string; response: string }[];
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
    defaultReceptionistName: 'Mike',
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
    domainKnowledge: [
      'We service and install all major residential and light commercial HVAC brands including Trane, Carrier, Lennox, Rheem, Goodman, Bryant, Mitsubishi Electric, Bosch, and Navien.',
      'Common AC symptoms: blowing warm air or weak airflow is often caused by a failed dual-run capacitor, worn contactor, dirty condenser coil, low refrigerant (R-410A or R-454B), or a frozen evaporator coil. If the caller sees ice on the copper refrigerant lines, advise switching the thermostat fan from Auto to On and turning cooling Off so the coil thaws before our technician arrives.',
      'Common furnace/heating symptoms: short-cycling (turning on and off every few minutes) or blowing cold air is frequently caused by a dirty flame sensor, failed hot surface ignitor, clogged air filter tripping the high-limit switch, or a blocked condensate drain trap.',
      'System replacements (12-20+ year old units): we perform a free in-home Manual J heat-load calculation to properly size high-efficiency SEER2 air conditioners, cold-climate inverter heat pumps, and 96%+ AFUE variable-speed gas furnaces, and walk homeowners through utility rebates, federal 25C tax credits, and financing.',
      'Indoor Air Quality (IAQ): we install AprilAire whole-home humidifiers, dehumidifiers, MERV 11-16 media air cleaners, and UV-C germicidal air scrubbers.'
    ],
    objectionHandling: [
      {
        trigger: 'Caller asks for an exact repair price or ballpark over the phone',
        response: 'Explain warmly that because the same symptom (like warm air) could be a simple capacitor or a refrigerant issue, our technician comes out for an $89 diagnostic, pinpoints the exact issue, and gives an upfront flat-rate price before doing any work—no surprises.'
      },
      {
        trigger: 'Caller asks how much a brand-new AC or furnace costs over the phone',
        response: 'Explain that system cost depends on home square footage, ductwork, and efficiency tier, which is why our in-home replacement estimates are 100% free and include Good-Better-Best written options.'
      },
      {
        trigger: 'Caller is hesitant about paying a diagnostic fee',
        response: 'Reassure them that the $89 diagnostic covers a full multi-point test by an EPA-certified tech, or let them know our Comfort Club plan ($19/mo) waives trip fees and takes 15% off repairs.'
      }
    ],
    customFaqs: [
      { id: 'f1', question: 'How much is a diagnostic service call?', answer: 'Our standard diagnostic fee is $89. A licensed technician thoroughly inspects your system and provides an upfront, exact quote before any work begins.' },
      { id: 'f2', question: 'Do you offer free estimates on new systems?', answer: 'Yes! We provide 100% free, no-obligation in-home estimates for complete furnace, AC, heat pump, or mini-split replacements.' },
      { id: 'f3', question: 'What is included in your Comfort Club maintenance plan?', answer: 'Our Comfort Club ($19/mo) includes 2 annual precision tune-ups, 15% off all repairs, priority scheduling, and waived after-hours dispatch fees.' },
      { id: 'f4', question: 'What should I do if my AC line is frozen?', answer: 'Turn your AC system Off at the thermostat and switch the fan to On. That helps thaw the indoor coil before our technician arrives so we can test your refrigerant pressures right away.' }
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
        prompt: "Hey Mike, this is Dave from York Supply. Is Josh around? I have his order confirmation.",
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
    defaultOfficeName: 'Spring Valley Roofing',
    defaultReceptionistName: 'Mike',
    defaultOwnerName: 'Chris',
    defaultOwnerTitle: 'Owner, CertainTeed Master Craftsman',
    defaultOwnerPhone: '+17175770668',
    emergencyKeywords: ['active leak', 'water pouring', 'roof collapse', 'tree on roof', 'downed line', 'emergency tarp', 'ceiling sagging'],
    equipmentTypes: ['CertainTeed Landmark Architectural Shingle', 'CertainTeed Vinyl Siding', 'Insulated Siding', 'Cedar Impressions Shake', 'Attic / Ridge Ventilation'],
    callTypes: [
      { key: 'roof_replacement_estimate', label: 'Roof Replacement Quote', description: 'Full tear-off or new roof estimate' },
      { key: 'siding_estimate', label: 'Siding Replacement Quote', description: 'CertainTeed vinyl, insulated, or Cedar Impressions quote' },
      { key: 'roof_repair', label: 'Roof Repair', description: 'Shingle repair, pipe boot, or flashing leak' },
      { key: 'storm_hail_damage', label: 'Storm / Hail Inspection', description: 'Insurance storm damage assessment' },
      { key: 'gutter_soffit_repair', label: 'Attic Ventilation', description: 'Ridge and intake ventilation, ice dams' },
      { key: 'emergency_tarping', label: 'Emergency Tarping', description: 'Active leak requiring immediate roof tarping' },
      { key: 'general_office', label: 'General Office', description: 'Billing, vendor, or general question' },
      { key: 'spam', label: 'Spam / Telemarketer', description: 'Unsolicited call' }
    ],
    tier1LifeSafetyInstructions: 'LIFE SAFETY ALERT: Instruct caller to immediately leave the building if structural roof collapse or downed electrical lines are present. Call 911 or electric utility before taking details.',
    tier2EmergencyGuidance: 'Active interior ceiling leaks pouring during heavy rain or tree damage requiring immediate tarping should be collected (address + callback) and flagged urgent so the office calls back right away for emergency tarping.',
    prohibitedClaims: [
      'Quoting exact per-square-foot roof replacement prices by phone without satellite/in-person measurement',
      'Guaranteeing 100% insurance claim approval by phone',
      'Instructing homeowners to climb onto wet or steep roofs to inspect damage themselves',
      'Promising exact completion dates before permit approval and crew scheduling'
    ],
    pricingDefaults: {
      serviceCall: 'Free written estimates; exact pricing is given in writing after an in-person inspection',
      afterHours: 'Emergency tarping and leak containment available; the office confirms timing and cost',
      maintenancePlanName: '',
      maintenancePlanPrice: '',
      maintenancePlanBenefits: 'No maintenance plan is offered. Do not mention one.'
    },
    domainKnowledge: [
      'Spring Valley Roofing is family-owned and operated out of Pottstown, PA, led by owner Chris (CertainTeed Master Craftsman), proudly serving Montgomery, Chester, and Berks Counties including Pottstown, Collegeville, Phoenixville, Royersford, Gilbertsville, Boyertown, King of Prussia, and West Chester.',
      'Roofing systems & materials: We specialize in CertainTeed Landmark and Landmark PRO architectural dimensional shingles with StreakFighter algae protection, DiamondDeck synthetic underlayment, WinterGuard ice & water shield in all valleys/eaves/penetrations, drip edge, and balanced ridge-vent + soffit intake attic ventilation. We also service standing seam metal roofs and EPDM/TPO low-slope porch and flat roofs.',
      'Common roof leak culprits: cracked or dry-rotted rubber pipe boots around plumbing vents, rusted chimney/dormer step or counter-flashing, lifted nail pops, clogged roof valleys, ice dams at the eaves, or wind-creased/missing shingles.',
      'Siding & exterior expertise: We install CertainTeed Monogram and MainStreet vinyl siding, CedarBoards insulated vinyl siding, Cedar Impressions polymer shake accents, aluminum fascia, vented soffit, and seamless gutters.',
      'Storm & hail insurance claims: High winds and hail often bruise the shingle fiberglass mat or break adhesive seal strips even when not obvious from the ground. We perform free storm inspections with detailed photo documentation, meet the homeowner insurance adjuster on the roof so nothing gets overlooked, and help navigate supplements—while never guaranteeing claim approval over the phone.',
      'Active leak homeowner guidance: If water is actively dripping inside during rain, advise placing a bucket underneath and moving valuables away, and remind them never to climb onto a wet roof. Capture their address and callback number immediately so we can coordinate emergency tarping.'
    ],
    objectionHandling: [
      {
        trigger: 'Caller asks how much a new roof or repair costs over the phone',
        response: 'Explain warmly that roof pricing depends on roof pitch, total squares, layers to tear off, decking condition, and shingle line, so we provide a 100% free, no-obligation in-person inspection and detailed written estimate—and offer to get them right on the schedule.'
      },
      {
        trigger: 'Caller asks if they should file an insurance claim before we inspect',
        response: 'Recommend having Chris or our storm specialist inspect the roof for free first—that way we can confirm whether there is legitimate wind or hail damage worth claiming before they put a claim on their insurance record.'
      },
      {
        trigger: 'Caller asks if we do small repairs like a pipe boot or missing shingles or only full roofs',
        response: 'Reassure them we handle everything from quick pipe-boot, flashing, and shingle repairs to emergency tarping, full CertainTeed roof replacements, and siding.'
      }
    ],
    customFaqs: [
      { id: 'rf1', question: 'Do you offer free estimates for roof replacements?', answer: 'Yes. Estimates are free and written, and we get back to you within one business day. We are family owned and operated out of Pottstown and serve Montgomery and Chester Counties. Office hours are Monday to Friday 8am to 7pm and Saturday 8am to 4pm. Phone (610) 948-5207.' },
      { id: 'rf2', question: 'Do you assist with storm & hail damage insurance claims?', answer: 'Yes. We document the damage with photos, meet your adjuster on site, and handle supplements for hail and wind claims. We never promise a claim will be approved.' },
      { id: 'rf3', question: 'How quickly can you tarp an active roof leak?', answer: 'We do emergency tarping and leak containment. I will flag your call as urgent so the office calls you right back to confirm timing.' },
      { id: 'rf4', question: 'What roofing brands and warranties do you offer?', answer: 'As a CertainTeed Master Craftsman contractor, we install CertainTeed Landmark and Landmark PRO architectural shingles backed by strong manufacturer and workmanship warranties.' }
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
        prompt: "Hi Mike, our architectural shingle roof is 22 years old and showing granule loss. We want a quote for a full tear-off and replacement.",
        description: 'Tests roof material intake, number of stories, and free estimate booking on calendar.'
      },
      {
        id: 'siding_hardie_quote',
        icon: 'Layers',
        title: 'CertainTeed Siding Quote',
        badge: 'Siding Lead',
        prompt: "Hello, we are redoing our home exterior and want an estimate for new CertainTeed vinyl siding.",
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
    defaultReceptionistName: 'Mike',
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
    domainKnowledge: [
      'Our licensed Master Plumbers handle emergency pipe bursts, main sewer line backups, hydro-jetting, HD sewer camera inspections, tank and tankless water heaters (Rinnai, Navien, Bradford White), sump pumps, and PEX/copper repiping.',
      'Immediate emergency flood guidance: For a burst pipe or active leak, calmly guide the caller to shut off the local fixture angle stop valve (clockwise under the sink or behind the toilet) or the main house water shutoff valve (located in the basement along the front foundation wall, near the water meter, or in the utility closet).',
      'Water heater triage: If a tank water heater is leaking from the bottom tank seam, the internal steel tank has corroded and requires replacement rather than repair; advise shutting off the cold-water supply valve on top of the heater and turning the gas dial to Pilot/Off or flipping the breaker.',
      'Sewer & drain triage: If multiple fixtures (especially basement floor drains, downstairs showers, and toilets) gurgle or back up simultaneously, it indicates a main sewer line blockage (often tree roots or a bellied line) rather than a single sink trap clog. Advise stopping all water usage in the home until our plumber clears the main cleanout.'
    ],
    objectionHandling: [
      {
        trigger: 'Caller asks for an exact plumbing repair or drain clearing price over the phone',
        response: 'Explain that for a $79 diagnostic visit, our licensed plumber inspects the exact pipe or drain issue and gives an upfront flat-rate price before starting any work—and offer to get a plumber headed their way.'
      },
      {
        trigger: 'Caller asks how much a new tank or tankless water heater costs',
        response: 'Share that we offer free in-home estimates on water heater replacements so we can check venting, gas line sizing, and gallon capacity, and give same-day installation options.'
      }
    ],
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
    defaultReceptionistName: 'Mike',
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
    domainKnowledge: [
      'Our licensed Master Electricians specialize in 100A to 200A/400A heavy-up service panel upgrades, replacement of hazardous/recalled panels (Federal Pacific Stab-Lok, Zinsco, Challenger, obsolete fuse boxes), EV Level 2 charging stations, whole-home standby generators (Generac, Kohler), and NEC-compliant troubleshooting.',
      'EV Charger expertise: We install hardwired 48A/60A Tesla Wall Connectors, ChargePoint Home Flex, and commercial-grade Hubbell NEMA 14-50 receptacles, complete with load calculations, load-shedding devices if a 100A panel is near capacity, and municipal electrical inspection sign-off.',
      'Electrical symptom triage: Warm or discolored outlets, a fishy/acrid plastic odor near switches or panels, or buzzing/crackling sounds indicate dangerous loose connections or arcing. Advise the caller to stop using that circuit immediately, unplug high-draw appliances (like space heaters), and never open the panel dead-front cover.',
      'Partial power loss or flickering lights when large appliances kick on often points to a loose utility neutral or corroded meter lug—we coordinate directly with the electric utility when meter pulls are required.'
    ],
    objectionHandling: [
      {
        trigger: 'Caller asks for an exact price over the phone to troubleshoot a dead outlet or tripping breaker',
        response: 'Explain that for an $89 diagnostic inspection, a licensed electrician traces the circuit fault safely with specialized meters and gives an upfront flat-rate repair price before doing any work.'
      },
      {
        trigger: 'Caller asks how much a 200A panel upgrade or EV charger installation costs',
        response: 'Explain that we provide free in-home estimates for panel upgrades and EV chargers so our electrician can check the panel capacity, wire run distance, and grounding, and provide an exact written quote.'
      }
    ],
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
        prompt: "Hi Mike, we are installing a hot tub and an EV charger and need to upgrade our old 100-amp electrical panel to 200 amps.",
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
    defaultReceptionistName: 'Mike',
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
    domainKnowledge: [
      'Our ISA Certified Arborists handle hazardous large-tree removals, zero-impact crane removals, structural crown pruning, canopy elevation, deep stump grinding (8-12 inches below grade with 811 utility markout), storm emergency clearing, and custom paver patios and retaining walls.',
      'Tree triage factors: Tree removal pricing and equipment needs (climber vs bucket truck vs crane) depend on trunk diameter (DBH), height, species (oak, pine, maple, dead ash with Emerald Ash Borer), backyard gate access, and proximity to roofs, fences, septic fields, or overhead power lines.',
      'Storm emergency & insurance: When a storm blows a tree onto a roof, garage, or across a driveway, we dispatch emergency crane and rigging crews to safely lift the tree without causing secondary structural damage, tarp roof breaches, and provide full photo documentation for homeowner insurance.'
    ],
    objectionHandling: [
      {
        trigger: 'Caller asks for a tree removal price over the phone',
        response: 'Explain that tree removal cost depends heavily on height, trunk diameter, crane or bucket truck access, and proximity to roofs or wires—which is why our Certified Arborist comes out for a 100% free on-site estimate.'
      },
      {
        trigger: 'Caller asks if they need to be home for the tree estimate',
        response: 'Let them know that as long as our arborist has access to the yard and knows which tree they want looked at, we can inspect it, take photos, and send a written quote even if they are at work.'
      }
    ],
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
        prompt: "Hi Mike, I have a dead 60-foot pine tree in my backyard near the power lines that needs to come down before winter.",
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
    defaultReceptionistName: 'Mike',
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
    domainKnowledge: [
      'We are a full-service licensed Design-Build General Contractor handling architectural drawings, structural engineering (LVL/steel beam installation for open-concept load-bearing wall removal), township building/zoning permits, and turnkey remodeling.',
      'Core renovation specialties: Custom kitchen remodels (custom cabinetry, quartz/granite islands, tile backsplashes), luxury bathroom renovations (curbless Schluter waterproofed walk-in showers, freestanding soaking tubs, heated tile floors), first- and second-story home additions, in-law suites, finished basements with code egress windows, and Trex/TimberTech composite decks and covered porches.',
      'Project workflow: Every remodeling project starts with a free in-home design consultation to discuss vision, layout, and target budget range, followed by 3D renderings, transparent line-item proposals, and full permit management.'
    ],
    objectionHandling: [
      {
        trigger: 'Caller asks how much a kitchen, bathroom, or addition costs over the phone',
        response: 'Explain that because remodeling scope varies from a cosmetic refresh to moving plumbing and load-bearing walls, we start with a free in-home design consultation to measure the space, hear their ideas, and put together a clear written estimate.'
      },
      {
        trigger: 'Caller asks if they need to hire their own architect or pull township permits',
        response: 'Reassure them that as a turnkey design-build contractor, we handle all architectural plans, structural engineering, township building permits, and inspections from start to finish.'
      }
    ],
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
        prompt: "Hi Mike, we want to remodel our 1990s kitchen, open up the wall to the dining room, and install custom quartz countertops.",
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
export function isRoofingMode(settings?: Settings | null): boolean {
  return settings?.industry === "roofing_siding";
}

export function toggleRoofingMode(currentSettings: Settings, enableRoofing: boolean, overwriteDefaults: boolean = false): Settings {
  const targetIndustry: IndustryType = enableRoofing ? "roofing_siding" : "hvac";
  if (overwriteDefaults) {
    return getSettingsForIndustry(targetIndustry);
  }
  return getSettingsForIndustry(targetIndustry, currentSettings);
}

const DEFAULT_TRADE_NAMES = [
  "Blueprint AI Business",
  "Lunar Heating and Cooling",
  "Lunar Heating & Air",
  "Spring Valley Roofing",
  "Apex Roofing & Siding",
  "Blue Wave Plumbing & Drains",
  "VoltCraft Electrical Solutions",
  "Timberline Tree & Storm Care",
  "Heritage Builders & Remodeling"
];

/**
 * Returns merged industry settings given a base configuration and target industry.
 */
export function getSettingsForIndustry(industry: IndustryType, existingSettings?: Settings): Settings {
  const preset = INDUSTRY_PRESETS[industry] || INDUSTRY_PRESETS.hvac;
  const isChangingTrade = existingSettings?.industry && existingSettings.industry !== industry;

  // Determine office name: if changing trade, or if currently using any default trade name, update to preset default
  let resolvedOfficeName = preset.defaultOfficeName;
  if (existingSettings?.office_name && !isChangingTrade) {
    resolvedOfficeName = existingSettings.office_name;
  } else if (existingSettings?.office_name && isChangingTrade) {
    const wasDefault = DEFAULT_TRADE_NAMES.includes(existingSettings.office_name.trim());
    resolvedOfficeName = wasDefault ? preset.defaultOfficeName : `${existingSettings.office_name} (${preset.shortName})`;
  }

  // Roofing guardrail: If roofing mode is active, purge any HVAC / old Apex branding remnants
  let resolvedReceptionistName = isChangingTrade ? preset.defaultReceptionistName : (existingSettings?.receptionist_name || preset.defaultReceptionistName);
  let resolvedReceptionistVoice = isChangingTrade ? (industry === "roofing_siding" ? "Puck" : (existingSettings?.receptionist_voice || "Puck")) : (existingSettings?.receptionist_voice || "Puck");
  if (industry === "roofing_siding") {
    if (!resolvedOfficeName || /lunar|heating|cooling|hvac|apex/i.test(resolvedOfficeName)) {
      resolvedOfficeName = "Spring Valley Roofing";
    }
    if (!resolvedReceptionistName || resolvedReceptionistName === "Sarah") {
      resolvedReceptionistName = "Mike";
    }
    if (!resolvedReceptionistVoice || resolvedReceptionistVoice === "Aoede") {
      resolvedReceptionistVoice = "Puck";
    }
  }

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
    receptionist_voice: "Puck",
    receptionist_voice_style: "warm, conversational, natural front-desk dispatcher with friendly human inflection",
    prompt_overrides: "",
    calendar_id: "primary",
    appointment_duration_minutes: 60,
    appointment_buffer_minutes: 15,
    sms_booking_confirmation_enabled: true
  };

  return {
    ...base,
    industry: industry,
    office_name: resolvedOfficeName,
    receptionist_name: resolvedReceptionistName,
    receptionist_voice: resolvedReceptionistVoice,
    receptionist_voice_style: existingSettings?.receptionist_voice_style || "warm, conversational, natural front-desk dispatcher with friendly human inflection",
    owner_name: isChangingTrade ? preset.defaultOwnerName : (existingSettings?.owner_name || preset.defaultOwnerName),
    owner_title: isChangingTrade ? preset.defaultOwnerTitle : (existingSettings?.owner_title || preset.defaultOwnerTitle),
    owner_phone_number: existingSettings?.owner_phone_number || preset.defaultOwnerPhone,
    after_hours_message: `Thank you for calling ${resolvedOfficeName}. Our office is currently closed. If this is an emergency, please stay on the line for instant routing.`,
    emergency_keywords: preset.emergencyKeywords,
    pricing_service_call: preset.pricingDefaults.serviceCall,
    pricing_after_hours: preset.pricingDefaults.afterHours,
    maintenance_plan_name: preset.pricingDefaults.maintenancePlanName,
    maintenance_plan_price: preset.pricingDefaults.maintenancePlanPrice,
    maintenance_plan_benefits: preset.pricingDefaults.maintenancePlanBenefits,
    custom_faqs: preset.customFaqs
  };
}
