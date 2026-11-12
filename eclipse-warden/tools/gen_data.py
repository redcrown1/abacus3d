#!/usr/bin/env python3
"""Generates the mod's JSON resources (models, blockstates, loot, recipes, tags, lang, dimension).

    python3 tools/gen_data.py
"""
import json
import os

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
RES = os.path.join(ROOT, 'src/main/resources')
MOD = 'eclipsewarden'


def write(rel, data):
    path = os.path.join(RES, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)
        fh.write('\n')


def asset(rel, data):
    write('assets/%s/%s' % (MOD, rel), data)


def data(rel, payload, ns=MOD):
    write('data/%s/%s' % (ns, rel), payload)


def m(name):
    return '%s:%s' % (MOD, name)


CUBES = ['umbral_stone', 'umbral_bricks', 'umbral_tiles', 'gilded_umbral_tiles', 'chiseled_umbral_bricks', 'eclipse_lantern']
BLOCKS = CUBES + ['umbral_pillar', 'eclipse_altar']
FLAT_ITEMS = ['eclipse_core', 'eclipse_sigil', 'umbral_shard', 'warden_crown']

# ---------------------------------------------------------------- block models
for name in CUBES:
    asset('blockstates/%s.json' % name, {'variants': {'': {'model': m('block/' + name)}}})
    asset('models/block/%s.json' % name, {'parent': 'minecraft:block/cube_all', 'textures': {'all': m('block/' + name)}})

asset('blockstates/umbral_pillar.json', {'variants': {
    'axis=y': {'model': m('block/umbral_pillar')},
    'axis=z': {'model': m('block/umbral_pillar_horizontal'), 'x': 90},
    'axis=x': {'model': m('block/umbral_pillar_horizontal'), 'x': 90, 'y': 90},
}})
pillar_tex = {'end': m('block/umbral_pillar_top'), 'side': m('block/umbral_pillar')}
asset('models/block/umbral_pillar.json', {'parent': 'minecraft:block/cube_column', 'textures': pillar_tex})
asset('models/block/umbral_pillar_horizontal.json', {'parent': 'minecraft:block/cube_column_horizontal', 'textures': pillar_tex})


def element(lo, hi, side, up=None, down=None):
    faces = {d: {'texture': side} for d in ('north', 'south', 'east', 'west')}
    faces['up'] = {'texture': up or side}
    faces['down'] = {'texture': down or side}
    return {'from': lo, 'to': hi, 'faces': faces}


altar_elements = [
    element([1, 0, 1], [15, 3, 15], '#side', '#gold', '#side'),
    element([3, 3, 3], [13, 5, 13], '#side', '#gold'),
    element([5, 5, 5], [11, 10, 11], '#side'),
    element([1, 10, 1], [15, 14, 15], '#side', '#top', '#gold'),
] + [element([x, 14, z], [x + 2, 16, z + 2], '#gold') for x in (1, 13) for z in (1, 13)]
asset('models/block/eclipse_altar.json', {
    'parent': 'minecraft:block/block',
    'textures': {'side': m('block/eclipse_altar_side'), 'top': m('block/eclipse_altar_top'),
                 'gold': m('block/eclipse_altar_gold'), 'particle': m('block/eclipse_altar_side')},
    'elements': altar_elements,
})
asset('models/block/eclipse_altar_active.json', {
    'parent': m('block/eclipse_altar'), 'textures': {'top': m('block/eclipse_altar_top_active')}})
asset('blockstates/eclipse_altar.json', {'variants': {
    'active=false': {'model': m('block/eclipse_altar')}, 'active=true': {'model': m('block/eclipse_altar_active')}}})

# ---------------------------------------------------------------- item models
for name in BLOCKS:
    asset('models/item/%s.json' % name, {'parent': m('block/' + name)})
for name in FLAT_ITEMS:
    asset('models/item/%s.json' % name, {'parent': 'minecraft:item/generated', 'textures': {'layer0': m('item/' + name)}})
asset('models/item/umbral_scepter.json', {'parent': 'minecraft:item/handheld', 'textures': {'layer0': m('item/umbral_scepter')}})
asset('models/item/eclipse_blade.json', {
    'parent': 'minecraft:item/handheld', 'textures': {'layer0': m('item/eclipse_blade')},
    'display': {
        'thirdperson_righthand': {'rotation': [0, -90, 55], 'translation': [0, 7.5, 1.5], 'scale': [1.35, 1.35, 1.35]},
        'thirdperson_lefthand': {'rotation': [0, 90, -55], 'translation': [0, 7.5, 1.5], 'scale': [1.35, 1.35, 1.35]},
        'firstperson_righthand': {'rotation': [0, -90, 25], 'translation': [1.13, 3.6, 1.13], 'scale': [0.78, 0.78, 0.78]},
        'firstperson_lefthand': {'rotation': [0, 90, -25], 'translation': [1.13, 3.6, 1.13], 'scale': [0.78, 0.78, 0.78]},
    }})
asset('models/item/eclipse_warden_spawn_egg.json', {'parent': 'minecraft:item/template_spawn_egg'})

for name in ('eclipse_spark', 'umbral_wisp'):
    asset('particles/%s.json' % name, {'textures': [m('%s_%d' % (name, i)) for i in range(4)]})

# ---------------------------------------------------------------- lang
EN = {
    'itemGroup.eclipsewarden': 'Eclipse Warden',
    'block.eclipsewarden.umbral_stone': 'Umbral Stone',
    'block.eclipsewarden.umbral_bricks': 'Umbral Bricks',
    'block.eclipsewarden.umbral_tiles': 'Umbral Tiles',
    'block.eclipsewarden.gilded_umbral_tiles': 'Gilded Umbral Tiles',
    'block.eclipsewarden.chiseled_umbral_bricks': 'Chiseled Umbral Bricks',
    'block.eclipsewarden.umbral_pillar': 'Umbral Pillar',
    'block.eclipsewarden.eclipse_lantern': 'Eclipse Lantern',
    'block.eclipsewarden.eclipse_altar': 'Eclipse Altar',
    'item.eclipsewarden.eclipse_sigil': 'Eclipse Sigil',
    'item.eclipsewarden.eclipse_sigil.tooltip': 'Use on an Eclipse Altar ringed by four lit candles',
    'item.eclipsewarden.umbral_shard': 'Umbral Shard',
    'item.eclipsewarden.eclipse_core': 'Eclipse Core',
    'item.eclipsewarden.eclipse_core.tooltip': 'The stilled heart of the Warden',
    'item.eclipsewarden.eclipse_blade': 'Eclipse Blade',
    'item.eclipsewarden.eclipse_blade.tooltip': 'Right-click: unleash a piercing Eclipse Slash',
    'item.eclipsewarden.umbral_scepter': 'Umbral Scepter',
    'item.eclipsewarden.umbral_scepter.tooltip': 'Right-click: hurl an umbral bolt',
    'item.eclipsewarden.warden_crown': "Warden's Crown",
    'item.eclipsewarden.warden_crown.tooltip': 'Grants sight in the dark',
    'item.eclipsewarden.eclipse_warden_spawn_egg': 'Eclipse Warden Spawn Egg',
    'entity.eclipsewarden.eclipse_warden': 'Eclipse Warden',
    'entity.eclipsewarden.umbral_bolt': 'Umbral Bolt',
    'entity.eclipsewarden.eclipse_slash': 'Eclipse Slash',
    'message.eclipsewarden.altar_hint': 'Ring the altar with four lit candles, then offer an Eclipse Sigil',
    'message.eclipsewarden.need_candles': 'The altar is silent: a lit candle must stand two blocks from each side',
    'message.eclipsewarden.ritual_running': 'The ritual is already under way',
    'message.eclipsewarden.ritual_start': 'The sun begins to darken...',
    'message.eclipsewarden.ritual_fizzle': 'The ritual fades: no one stood by the altar',
    'message.eclipsewarden.fight_running': 'The Warden is already awake',
    'message.eclipsewarden.no_court': 'The Eclipsed Court cannot be reached in this world',
    'message.eclipsewarden.victory': 'The eclipse breaks. Touch the altar to return home.',
    'message.eclipsewarden.protected': 'The Court cannot be reshaped',
    'title.eclipsewarden.court': 'The Eclipsed Court',
    'title.eclipsewarden.court.sub': 'The Warden stirs',
    'title.eclipsewarden.victory': 'Totality Broken',
    'commands.eclipsewarden.enter': 'Entering the Eclipsed Court',
    'commands.eclipsewarden.leave': 'Leaving the Eclipsed Court',
    'commands.eclipsewarden.rebuild': 'Rebuilt the Eclipsed Court arena',
    'advancements.eclipsewarden.root.title': 'Eclipse Warden',
    'advancements.eclipsewarden.root.description': 'Craft an Eclipse Altar',
    'advancements.eclipsewarden.court.title': 'Totality',
    'advancements.eclipsewarden.court.description': 'Complete the ritual and enter the Eclipsed Court',
    'advancements.eclipsewarden.slayer.title': 'Sunbreaker',
    'advancements.eclipsewarden.slayer.description': 'Defeat the Eclipse Warden',
    'advancements.eclipsewarden.crown.title': 'Heavy Is the Head',
    'advancements.eclipsewarden.crown.description': "Forge the Warden's Crown from an Eclipse Core",
    'death.attack.eclipsewarden.generic': '%1$s was unmade by the eclipse',
}
RU = {
    'itemGroup.eclipsewarden': 'Страж Затмения',
    'block.eclipsewarden.umbral_stone': 'Сумрачный камень',
    'block.eclipsewarden.umbral_bricks': 'Сумрачные кирпичи',
    'block.eclipsewarden.umbral_tiles': 'Сумрачная плитка',
    'block.eclipsewarden.gilded_umbral_tiles': 'Золочёная сумрачная плитка',
    'block.eclipsewarden.chiseled_umbral_bricks': 'Резные сумрачные кирпичи',
    'block.eclipsewarden.umbral_pillar': 'Сумрачная колонна',
    'block.eclipsewarden.eclipse_lantern': 'Фонарь затмения',
    'block.eclipsewarden.eclipse_altar': 'Алтарь затмения',
    'item.eclipsewarden.eclipse_sigil': 'Печать затмения',
    'item.eclipsewarden.eclipse_sigil.tooltip': 'Используйте на алтаре затмения, окружённом четырьмя зажжёнными свечами',
    'item.eclipsewarden.umbral_shard': 'Сумрачный осколок',
    'item.eclipsewarden.eclipse_core': 'Ядро затмения',
    'item.eclipsewarden.eclipse_core.tooltip': 'Замершее сердце Стража',
    'item.eclipsewarden.eclipse_blade': 'Клинок затмения',
    'item.eclipsewarden.eclipse_blade.tooltip': 'ПКМ: выпустить пронзающий разрез затмения',
    'item.eclipsewarden.umbral_scepter': 'Сумрачный скипетр',
    'item.eclipsewarden.umbral_scepter.tooltip': 'ПКМ: метнуть сумрачный сгусток',
    'item.eclipsewarden.warden_crown': 'Корона Стража',
    'item.eclipsewarden.warden_crown.tooltip': 'Дарует зрение во тьме',
    'item.eclipsewarden.eclipse_warden_spawn_egg': 'Яйцо призыва Стража Затмения',
    'entity.eclipsewarden.eclipse_warden': 'Страж Затмения',
    'entity.eclipsewarden.umbral_bolt': 'Сумрачный сгусток',
    'entity.eclipsewarden.eclipse_slash': 'Разрез затмения',
    'message.eclipsewarden.altar_hint': 'Окружите алтарь четырьмя зажжёнными свечами и поднесите печать затмения',
    'message.eclipsewarden.need_candles': 'Алтарь молчит: в двух блоках от каждой стороны должна гореть свеча',
    'message.eclipsewarden.ritual_running': 'Ритуал уже идёт',
    'message.eclipsewarden.ritual_start': 'Солнце начинает меркнуть...',
    'message.eclipsewarden.ritual_fizzle': 'Ритуал угас: у алтаря никого не было',
    'message.eclipsewarden.fight_running': 'Страж уже пробуждён',
    'message.eclipsewarden.no_court': 'В этом мире нельзя попасть в Затмённый Двор',
    'message.eclipsewarden.victory': 'Затмение рассеивается. Коснитесь алтаря, чтобы вернуться домой.',
    'message.eclipsewarden.protected': 'Двор нельзя перестроить',
    'title.eclipsewarden.court': 'Затмённый Двор',
    'title.eclipsewarden.court.sub': 'Страж пробуждается',
    'title.eclipsewarden.victory': 'Затмение сломлено',
    'commands.eclipsewarden.enter': 'Вход в Затмённый Двор',
    'commands.eclipsewarden.leave': 'Выход из Затмённого Двора',
    'commands.eclipsewarden.rebuild': 'Арена Затмённого Двора восстановлена',
    'advancements.eclipsewarden.root.title': 'Страж Затмения',
    'advancements.eclipsewarden.root.description': 'Создайте алтарь затмения',
    'advancements.eclipsewarden.court.title': 'Полная фаза',
    'advancements.eclipsewarden.court.description': 'Завершите ритуал и войдите в Затмённый Двор',
    'advancements.eclipsewarden.slayer.title': 'Сокрушитель солнца',
    'advancements.eclipsewarden.slayer.description': 'Победите Стража Затмения',
    'advancements.eclipsewarden.crown.title': 'Тяжела ты, корона',
    'advancements.eclipsewarden.crown.description': 'Выкуйте Корону Стража из ядра затмения',
    'death.attack.eclipsewarden.generic': '%1$s был развоплощён затмением',
}
assert EN.keys() == RU.keys()
asset('lang/en_us.json', EN)
asset('lang/ru_ru.json', RU)

# ---------------------------------------------------------------- loot, tags
for name in BLOCKS:
    data('loot_table/blocks/%s.json' % name, {
        'type': 'minecraft:block',
        'pools': [{'rolls': 1, 'entries': [{'type': 'minecraft:item', 'name': m(name)}],
                   'conditions': [{'condition': 'minecraft:survives_explosion'}]}]})
data('tags/block/mineable/pickaxe.json', {'replace': False, 'values': [m(b) for b in BLOCKS]}, ns='minecraft')
data('tags/block/needs_stone_tool.json', {'replace': False, 'values': [m(b) for b in BLOCKS]}, ns='minecraft')
data('tags/item/swords.json', {'replace': False, 'values': [m('eclipse_blade')]}, ns='minecraft')
data('tags/item/head_armor.json', {'replace': False, 'values': [m('warden_crown')]}, ns='minecraft')
data('tags/item/enchantable/durability.json', {'replace': False, 'values': [m('umbral_scepter')]}, ns='minecraft')


# ---------------------------------------------------------------- recipes
def shaped(name, pattern, key, result, count=1, category='misc'):
    data('recipe/%s.json' % name, {
        'type': 'minecraft:crafting_shaped', 'category': category, 'pattern': pattern,
        'key': {k: {'item': v} for k, v in key.items()}, 'result': {'id': result, 'count': count}})


def stonecut(src, dst, count=1):
    data('recipe/%s_from_%s_stonecutting.json' % (dst, src), {
        'type': 'minecraft:stonecutting', 'ingredient': {'item': m(src)}, 'result': {'id': m(dst), 'count': count}})


shaped('eclipse_altar', ['CGC', 'OEO', 'OOO'], {
    'C': 'minecraft:crying_obsidian', 'G': 'minecraft:gold_ingot', 'O': 'minecraft:obsidian', 'E': 'minecraft:ender_eye',
}, m('eclipse_altar'))
shaped('eclipse_sigil', ['GAG', 'AEA', 'GAG'], {
    'G': 'minecraft:gold_nugget', 'A': 'minecraft:amethyst_shard', 'E': 'minecraft:ender_eye'}, m('eclipse_sigil'))
shaped('umbral_stone', ['DDD', 'DAD', 'DDD'], {
    'D': 'minecraft:cobbled_deepslate', 'A': 'minecraft:amethyst_shard'}, m('umbral_stone'), 8, 'building')
shaped('umbral_bricks', ['SS', 'SS'], {'S': m('umbral_stone')}, m('umbral_bricks'), 4, 'building')
shaped('umbral_tiles', ['SS', 'SS'], {'S': m('umbral_bricks')}, m('umbral_tiles'), 4, 'building')
shaped('gilded_umbral_tiles', [' T ', 'TGT', ' T '], {
    'T': m('umbral_tiles'), 'G': 'minecraft:gold_nugget'}, m('gilded_umbral_tiles'), 4, 'building')
shaped('umbral_pillar', ['S', 'S'], {'S': m('umbral_bricks')}, m('umbral_pillar'), 2, 'building')
shaped('eclipse_lantern', [' B ', 'BGB', ' B '], {
    'B': m('umbral_bricks'), 'G': 'minecraft:glowstone'}, m('eclipse_lantern'), 2, 'building')
shaped('warden_crown', ['SCS', 'G G'], {
    'S': m('umbral_shard'), 'C': m('eclipse_core'), 'G': 'minecraft:gold_ingot'}, m('warden_crown'), 1, 'equipment')
shaped('umbral_scepter', [' SS', ' BS', 'B  '], {
    'S': m('umbral_shard'), 'B': 'minecraft:blaze_rod'}, m('umbral_scepter'), 1, 'equipment')
for src, dst in (('umbral_stone', 'umbral_bricks'), ('umbral_stone', 'umbral_tiles'), ('umbral_stone', 'umbral_pillar'),
                 ('umbral_stone', 'chiseled_umbral_bricks'), ('umbral_bricks', 'umbral_tiles'),
                 ('umbral_bricks', 'umbral_pillar'), ('umbral_bricks', 'chiseled_umbral_bricks')):
    stonecut(src, dst)


# ---------------------------------------------------------------- advancements
def advancement(name, icon, criteria, parent=None, frame='task', background=None):
    display = {
        'icon': {'id': m(icon)},
        'title': {'translate': 'advancements.eclipsewarden.%s.title' % name},
        'description': {'translate': 'advancements.eclipsewarden.%s.description' % name},
        'frame': frame, 'show_toast': True, 'announce_to_chat': True, 'hidden': False,
    }
    if background:
        display['background'] = background
    payload = {'display': display, 'criteria': criteria}
    if parent:
        payload['parent'] = m(parent)
    data('advancement/%s.json' % name, payload)


advancement('root', 'eclipse_altar', {'altar': {
    'trigger': 'minecraft:inventory_changed', 'conditions': {'items': [{'items': m('eclipse_altar')}]}}},
    background='eclipsewarden:textures/block/umbral_bricks.png')
advancement('court', 'eclipse_sigil', {'entered': {
    'trigger': 'minecraft:changed_dimension', 'conditions': {'to': m('eclipsed_court')}}}, parent='root', frame='goal')
advancement('slayer', 'eclipse_blade', {'killed': {
    'trigger': 'minecraft:player_killed_entity',
    'conditions': {'entity': [{'condition': 'minecraft:entity_properties', 'entity': 'this',
                               'predicate': {'type': m('eclipse_warden')}}]}}}, parent='court', frame='challenge')
advancement('crown', 'warden_crown', {'crown': {
    'trigger': 'minecraft:inventory_changed', 'conditions': {'items': [{'items': m('warden_crown')}]}}}, parent='slayer')

# ---------------------------------------------------------------- dimension
data('dimension_type/eclipsed_court.json', {
    'ultrawarm': False, 'natural': False, 'piglin_safe': False, 'respawn_anchor_works': False, 'bed_works': False,
    'has_raids': False, 'has_skylight': True, 'has_ceiling': False, 'coordinate_scale': 1.0, 'ambient_light': 0.12,
    'fixed_time': 12700, 'logical_height': 256, 'effects': m('eclipsed_court'),
    'infiniburn': '#minecraft:infiniburn_end', 'min_y': 0, 'height': 256,
    'monster_spawn_light_level': 0, 'monster_spawn_block_light_limit': 0})
data('dimension/eclipsed_court.json', {
    'type': m('eclipsed_court'),
    'generator': {'type': 'minecraft:flat', 'settings': {
        'biome': m('eclipsed_court'), 'lakes': False, 'features': False,
        'layers': [{'block': 'minecraft:air', 'height': 1}], 'structure_overrides': []}}})
data('worldgen/biome/eclipsed_court.json', {
    'has_precipitation': False, 'temperature': 0.5, 'downfall': 0.0,
    'effects': {'sky_color': 0x0B0614, 'fog_color': 0x150B26, 'water_color': 0x3F76E4, 'water_fog_color': 0x050533,
                'particle': {'options': {'type': m('umbral_wisp')}, 'probability': 0.002}},
    'spawners': {}, 'spawn_costs': {}, 'carvers': {}, 'features': []})
print('resources written')
