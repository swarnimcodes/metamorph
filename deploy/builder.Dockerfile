# Builds the API on the same Fedora release the server runs, so the binary links the same glibc.
FROM fedora:44
RUN dnf install -y --setopt=install_weak_deps=False rust cargo gcc gcc-c++ make cmake perl-core pkgconf-pkg-config \
    && dnf clean all
WORKDIR /src
