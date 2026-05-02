// Deterministic three-word name for any entry hash, e.g. "arc.chain.proof"
const WORDS = [
  'ace','arc','ash','bay','bit','bog','bow','bud','bug','bus',
  'cap','cat','cod','cop','cot','cup','cut','dam','den','dew',
  'dig','dim','dip','dot','dye','ear','eel','egg','elf','elm',
  'end','era','eve','eye','fan','far','fat','fee','fen','fig',
  'fin','fix','fly','fog','fox','fur','gap','gem','gin','gnu',
  'god','gun','gut','hay','hex','hid','hip','hog','hop','hot',
  'hub','hue','hum','ice','imp','ink','ion','ivy','jab','jam',
  'jar','jaw','jet','jot','joy','jug','jut','keg','key','kid',
  'kin','kit','lab','lag','lap','law','lay','lea','leg','let',
  'lid','lip','lit','log','lot','low','lug','mad','map','mar',
  'mat','mob','mod','mop','mud','mug','nag','net','nip','nit',
  'nod','nor','nub','nun','nut','oak','oar','oat','odd','off',
  'oil','old','one','orb','ore','our','out','owe','own','pad',
  'pan','pat','pea','peg','pen','pet','pie','pig','pin','pit',
  'pod','pop','pot','pub','pun','pup','put','rag','ran','rap',
  'rat','raw','ray','red','ref','rep','rev','rid','rim','rip',
  'rob','rod','rot','row','rub','rum','run','rut','sad','sap',
  'sat','saw','say','sea','set','sew','shy','sin','sip','sir',
  'sit','ski','sky','sly','sob','son','sow','soy','spa','spy',
  'sub','sum','sun','tab','tan','tap','tar','tax','tee','tip',
  'ton','top','tot','tow','toy','tub','tug','two','urn','use',
  'van','vat','via','vie','vim','vow','war','wax','web','wed',
  'wet','wig','win','wit','woe','woo','yak','yam','yap','yaw',
  'yen','yet','yew','yip','zen','zip','zoo','arc','ash','bay',
  'blue','bold','bone','book','born','both','burn','byte','call',
  'calm','care','cast','cave','city','clan','clay','clip','code',
]

export function entryName(entryId: string): string {
  const hex = entryId.replace('0x', '')
  const b0 = parseInt(hex.slice(0, 2), 16) % WORDS.length
  const b1 = parseInt(hex.slice(4, 6), 16) % WORDS.length
  const b2 = parseInt(hex.slice(8, 10), 16) % WORDS.length
  return `${WORDS[b0]}.${WORDS[b1]}.${WORDS[b2]}`
}

// Full "ENS-style" display name with suffix
export function entryEns(entryId: string): string {
  return `${entryName(entryId)}.mnemo`
}
