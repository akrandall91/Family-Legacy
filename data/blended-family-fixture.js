// Non-production demonstration fixture for relationship-engine regression tests.
const BlendedFamilyFixture = {
  meta:{family_name:'Blended Family Fixture',home_branch_id:'branch_home',root_branch_ids:['branch_christine_ancestors','branch_kenneth_ancestors'],default_exploration_mode:'home'},
  branches:[
    {id:'branch_home',slug:'home',name:'Current Family Anchor',branch_type:'anchor',root_person_ids:['christine','kenneth'],connected_branches:[],child_branch_ids:[],color:'#76543d'},
    {id:'branch_christine_ancestors',slug:'christine-ancestors',name:'Christine ancestral research',branch_type:'research',root_person_ids:['christine_parent'],connected_branches:[{branch_id:'branch_home',relationship:'descends-from',through_person_id:'christine',status:'confirmed'}],child_branch_ids:[],color:'#426b55'},
    {id:'branch_kenneth_ancestors',slug:'kenneth-ancestors',name:'Kenneth oral-history line',branch_type:'unlinked',root_person_ids:['kenneth_possible_ancestor'],connected_branches:[{branch_id:'branch_home',relationship:'possible-connection',through_person_id:'kenneth',status:'oral-history'}],child_branch_ids:[],color:'#5d5680'}
  ],
  persons:[
    {id:'christine',name:{display:'Christine'},relationships:{parents:[{person_id:'christine_parent',relationship_type:'biological',status:'confirmed'}],spouses:[{person_id:'kenneth',relationship_type:'marriage',status:'confirmed'}],children:['ripton','shared']},branch_ids:['branch_home','branch_christine_ancestors'],primary_branch_id:'branch_home'},
    {id:'kenneth',name:{display:'Kenneth'},relationships:{parents:[{person_id:'kenneth_possible_ancestor',relationship_type:'biological',status:'oral-history'}],spouses:[{person_id:'christine',relationship_type:'marriage',status:'confirmed'}],children:['norma','shared']},branch_ids:['branch_home','branch_kenneth_ancestors'],primary_branch_id:'branch_home'},
    {id:'ripton',name:{display:'Ripton'},relationships:{parents:[{person_id:'christine',relationship_type:'biological',status:'confirmed'},{person_id:'kenneth',relationship_type:'step',status:'confirmed'}],spouses:[],children:[]},branch_ids:['branch_home']},
    {id:'norma',name:{display:'Norma'},relationships:{parents:[{person_id:'kenneth',relationship_type:'biological',status:'confirmed'},{person_id:'christine',relationship_type:'step',status:'confirmed'}],spouses:[],children:[]},branch_ids:['branch_home']},
    {id:'shared',name:{display:'Shared Child'},relationships:{parents:[{person_id:'christine',relationship_type:'biological',status:'confirmed'},{person_id:'kenneth',relationship_type:'biological',status:'confirmed'}],spouses:[],children:[]},branch_ids:['branch_home']},
    {id:'christine_parent',name:{display:'Christine Parent'},relationships:{parents:[],spouses:[],children:['christine']},branch_ids:['branch_christine_ancestors']},
    {id:'kenneth_possible_ancestor',name:{display:'Possible Kenneth Ancestor'},relationships:{parents:[],spouses:[],children:[{person_id:'kenneth',relationship_type:'biological',status:'oral-history'}]},branch_ids:['branch_kenneth_ancestors']}
  ],
  unions:[{id:'union_christine_kenneth',partner_ids:['christine','kenneth'],relationship_type:'marriage',child_ids:['shared'],status:'confirmed',source_ids:[],notes:'Only the documented shared child belongs to this union.',privacy:'family'}],
  households:[{id:'household_current',adult_ids:['christine','kenneth'],child_ids:['ripton','norma','shared'],notes:'Supports step-sibling/household display without changing biological lineage.',privacy:'family'}],events:[],stories:[],media:[],locations:{},sources:[]
};
