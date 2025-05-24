#!/usr/sbin/sh
cd ~
yes | pacman -Syu
yes | pacman -S nushell helix neovim fd bat ripgrep direnv zoxide eza starship just git fzf yazi difftastic openssh gh
git clone https://github.com/groutoutlook/nushellConfig ~/.config/nushell
git clone https://github.com/groutoutlook/dotfiles
ln -sr ~/dotfiles/.gitconfig ~
ln -sr ~/dotfiles/config/helix ~/.config
ln -sr ~/dotfiles/config/starship.toml ~/.config
ln -sr ~/dotfiles/config/.ripgreprc ~/.config
chsh -s /usr/bin/nu
exit
