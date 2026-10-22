-- Indoor start without QR codes.
-- Room numbers are searchable even when the sign on the door says "Room 201".
-- photo_url is optional landmark art for indoor steps. Lift copy names the destination floor.

alter table public.nodes add column if not exists room_number text;
alter table public.nodes add column if not exists photo_url text;

comment on column public.nodes.room_number is 'Door number, such as 201, used by room search.';
comment on column public.nodes.photo_url is 'Optional public photo of this landmark for indoor guidance.';

update public.nodes set room_number = '001' where qr_code = 'ELB-LT001' and room_number is null;
update public.nodes set room_number = '101' where qr_code = 'ELB-LT101' and room_number is null;
update public.nodes set room_number = '102' where qr_code = 'ELB-LT102' and room_number is null;
update public.nodes set room_number = '201' where qr_code = 'ELB-LT201' and room_number is null;

update public.buildings
set description = 'Three floors, a step-free ramp, and two lifts. Rooms 001, 101, 102, and 201.'
where code = 'ELB'
  and description like 'Pilot building%';

update public.edges
set instruction_text = 'Take Lift A to Floor 1.',
    reverse_instruction_text = 'Take Lift A to Ground.'
where instruction_text = 'Take Lift A up to level 1.';

update public.edges
set instruction_text = 'Take Lift A to Floor 2. Step out when the doors open.',
    reverse_instruction_text = 'Take Lift A to Floor 1.'
where instruction_text = 'Take Lift A up to level 2. Step out when the doors open.';

update public.edges
set instruction_text = 'Take Lift B to Floor 1.',
    reverse_instruction_text = 'Take Lift B to Ground.'
where instruction_text = 'Take Lift B up to level 1.';

update public.edges
set instruction_text = 'Take Lift B to Floor 2. Step out when the doors open.',
    reverse_instruction_text = 'Take Lift B to Floor 1.'
where instruction_text = 'Take Lift B up to level 2. Step out when the doors open.';
