config = {
    'stage_product': 'thunderbird',
    'stage_username': 'tbirdbld',
    'stage_ssh_key': 'tbirdbld_rsa',
    'app_name': 'comm/mail',
    'objdir': 'obj-thunderbird',

    # Thunderbird doesn't compile under pgo
    'pgo_platforms': []
}
