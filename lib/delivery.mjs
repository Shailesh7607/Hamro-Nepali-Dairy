export const deliveryAreas = [
 {id:'sanepa',label:'सानेपा',fee:100},
 {id:'lalitpur_ring',label:'अन्य ललितपुर क्षेत्र (रिङ रोडभित्र)',fee:150},
 {id:'kathmandu_ring',label:'काठमाडौं (रिङ रोडभित्र)',fee:200},
 {id:'bhaktapur_city',label:'भक्तपुर शहर',fee:300},
 {id:'other',label:'अन्य क्षेत्र — शुल्क पुष्टि आवश्यक',fee:null},
];
export function deliveryArea(id){return deliveryAreas.find(area=>area.id===id);}
