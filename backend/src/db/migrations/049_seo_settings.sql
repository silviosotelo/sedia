-- SEO & meta tags configurables desde system_settings
INSERT INTO system_settings (key, value, description, is_secret)
VALUES
    ('seo_title', '"SEDIA - Plataforma de Comprobantes Fiscales"', 'Título del sitio (tag <title> y og:title)', false),
    ('seo_description', '"Plataforma SaaS para gestión de comprobantes fiscales del SET Paraguay. Marangatu, eKuatia, facturación electrónica SIFEN."', 'Meta description para SEO', false),
    ('seo_keywords', '"comprobantes fiscales, SET Paraguay, Marangatu, eKuatia, SIFEN, facturación electrónica, impuestos Paraguay"', 'Meta keywords (separados por coma)', false),
    ('seo_og_image', '""', 'URL de imagen Open Graph (og:image) para compartir en redes', false),
    ('seo_og_type', '"website"', 'Tipo Open Graph (website, article, etc.)', false),
    ('seo_og_url', '""', 'URL canónica del sitio (og:url)', false),
    ('seo_twitter_card', '"summary_large_image"', 'Tipo de Twitter Card (summary, summary_large_image)', false),
    ('seo_robots', '"index, follow"', 'Directiva robots (index/noindex, follow/nofollow)', false),
    ('seo_language', '"es"', 'Idioma del sitio (atributo lang del HTML)', false),
    ('seo_theme_color', '"#2a85ff"', 'Color del tema del navegador (meta theme-color)', false)
ON CONFLICT (key) DO NOTHING;
