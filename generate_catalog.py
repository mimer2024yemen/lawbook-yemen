import json
from pathlib import Path

root = Path('/home/user/lawbook-yemen')
db = json.loads((root / 'database.json').read_text(encoding='utf-8'))

section_labels = {
    'civil': 'الدعاوى المدنية',
    'personal-status': 'الأحوال الشخصية',
    'litigation-procedures': 'إجراءات التقاضي',
    'criminal': 'الجرائم الجنائية',
    'labor': 'العمل',
    'yemeni-laws': 'القوانين اليمنية',
    'legal-procedure-deadlines': 'مواعيد الإجراءات القانونية',
    'urgent': 'الدعاوى المستعجلة',
    'commercial': 'الدعاوى التجارية'
}


def clean_text(text: str) -> str:
    return ' '.join((text or '').replace('\u200f', ' ').replace('\u200e', ' ').split())


def excerpt(text: str, limit: int = 180) -> str:
    text = clean_text(text)
    return text if len(text) <= limit else text[:limit].rstrip() + '...'


def contract_category(title: str) -> str:
    t = clean_text(title)
    if 'بيع' in t:
        return 'بيع'
    if 'إيجار' in t or 'سكن' in t:
        return 'إيجار'
    if 'شركة' in t:
        return 'شركة'
    if 'وكالة' in t:
        return 'وكالة'
    if 'قرض' in t:
        return 'قرض'
    if 'تنازل' in t:
        return 'تنازل'
    if 'إقرار' in t:
        return 'إقرار'
    if 'كفالة' in t:
        return 'كفالة'
    return 'أخرى'


def build_search_text(item: dict, limit: int = 2500) -> str:
    parts = []
    if item.get('description'):
        parts.append(item['description'])
    parts.extend(item.get('content') or [])
    for article in item.get('articles') or []:
        parts.append(f"مادة {article.get('number', '')} {article.get('text', '')}")
    text = clean_text(' '.join(parts))
    return text[:limit]

catalog = {
    'stats': {
        'laws': 0,
        'articles': 0,
        'contracts': len(db.get('contracts') or []),
        'posts': len(db.get('posts') or [])
    },
    'section_labels': section_labels,
    'laws': {},
    'contracts': [],
    'posts': []
}

for section, items in db['laws'].items():
    out = []
    for item in items:
        search_text = build_search_text(item)
        article_count = len(item.get('articles') or [])
        out.append({
            'type': 'law',
            'section': section,
            'sectionLabel': section_labels.get(section, section),
            'title': clean_text(item.get('title', '')),
            'slug': item.get('slug', ''),
            'url': item.get('url', ''),
            'description': excerpt(item.get('description') or search_text),
            'searchText': search_text,
            'articleCount': article_count,
        })
        catalog['stats']['articles'] += article_count
    catalog['laws'][section] = out
    catalog['stats']['laws'] += len(out)

for item in db.get('contracts') or []:
    search_text = build_search_text(item)
    catalog['contracts'].append({
        'type': 'contract',
        'title': clean_text(item.get('title', '')),
        'slug': item.get('slug', ''),
        'url': item.get('url', ''),
        'category': contract_category(item.get('title', '')),
        'description': excerpt(item.get('description') or search_text),
        'searchText': search_text,
        'articleCount': 0,
    })

for item in db.get('posts') or []:
    search_text = build_search_text(item)
    catalog['posts'].append({
        'type': 'post',
        'title': clean_text(item.get('title', '')),
        'slug': item.get('slug', ''),
        'url': item.get('url', ''),
        'description': excerpt(item.get('description') or search_text),
        'searchText': search_text,
        'articleCount': 0,
    })

(root / 'catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding='utf-8')
print('catalog.json generated')
print('size bytes', (root / 'catalog.json').stat().st_size)
